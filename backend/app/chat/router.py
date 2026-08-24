"""
POST /chat  (mounted under whatever prefix main.py gives it, e.g. /api/v1/chat)
"""
import json
import logging
import os
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from groq import AsyncGroq, APIStatusError, RateLimitError
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.redis import redis_get, redis_set
from app.chat import session as chat_session
from app.chat.tools import TOOL_SCHEMAS, TOOL_IMPLEMENTATIONS

logger = logging.getLogger("printex.chat")

router = APIRouter(prefix="/chat", tags=["chat"])

# os.environ["GROQ_API_KEY"] raised KeyError at IMPORT time. app/main.py
# imports this module at the top, so on any deploy without GROQ_API_KEY set
# (Render, staging, a fresh container) the whole FastAPI app failed to boot —
# /auth/login included. The chatbot is an optional extra; it must never be
# able to take the login endpoint down with it.
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = "llama-3.3-70b-versatile"
MAX_TOOL_HOPS = 4
MAX_MALFORMED_RETRIES = 2  # llama-3.3-70b-versatile occasionally emits malformed tool-call syntax; a retry usually clears it

# Free-tier protection: cap requests per session per minute
RATE_LIMIT_MAX_REQUESTS = 15
RATE_LIMIT_WINDOW_SECONDS = 60

# async client -- avoids blocking the event loop. Built lazily: constructing
# it at import time with an empty key is what coupled "no GROQ_API_KEY" to
# "entire API is down".
client: "AsyncGroq | None" = AsyncGroq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None


def _require_groq() -> AsyncGroq:
    if client is None:
        raise HTTPException(
            status_code=503,
            detail="The assistant is not configured on this server (GROQ_API_KEY is unset).",
        )
    return client

_LEAKED_TOOL_SYNTAX = re.compile(r"<function[^>]*>.*?</function>|<function[^>]*/?>", re.DOTALL)


def _sanitize_reply(text: str) -> str:
    """Strip any pseudo tool-call syntax the model occasionally leaks into
    its content field (e.g. '<function>search_products</function>')."""
    cleaned = _LEAKED_TOOL_SYNTAX.sub("", text or "").strip()
    return cleaned or "Sorry, I don't have that information right now — could you try rephrasing?"


SYSTEM_PROMPT = """You are Printex Engineers' assistant — Printex sells and stocks spare \
parts for offset printing presses (valves, cylinders, bellows, grippers, bearings, springs \
and similar parts) from its Nairobi workshop. Prices are in KSh, and each part may also carry \
a recorded buying price in USD. Be warm, concise, and practical, the way a knowledgeable \
parts-counter engineer in Nairobi would be.

Rules:
- Only state prices, stock, part numbers, or order statuses that come from a tool call. Never guess or invent them.
- If asked about an order, always ask for the order ID and the phone number on the order before looking it up.
- For payment questions, note Printex uses M-Pesa (STK push at checkout).
- Some parts are flagged "needs pricing" and cannot be sold until a price is set — say so plainly if a lookup shows this.
- If a request involves a dispute, refund, or anything you can't resolve, tell the user you're \
escalating to human support rather than promising an outcome.
- If a tool call returns zero results or an error, just say plainly that you don't currently have \
that part or can't find that order — never mention the tool, function names, or write anything that \
looks like <function>...</function> in your reply. Speak only in plain natural language to the user.
- Keep answers short — this is a chat widget, not an essay.
"""


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    session_id: str | None = None


class ChatResponse(BaseModel):
    reply: str
    session_id: str


def _resolve_session_id(raw: str | None) -> str:
    """Only trust a client-supplied session_id if it's actually a valid UUID
    we could plausibly have issued -- otherwise mint a fresh one. Prevents
    arbitrary strings from being used as Redis keys."""
    if raw:
        try:
            return str(uuid.UUID(raw))
        except ValueError:
            logger.warning("Rejected malformed session_id from client: %r", raw)
    return str(uuid.uuid4())


async def _check_rate_limit(session_id: str) -> None:
    key = f"chat_rate:{session_id}"
    current = await redis_get(key)
    count = (current or 0) + 1
    if count > RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(status_code=429, detail="Too many messages — please wait a moment and try again.")
    await redis_set(key, count, ttl=RATE_LIMIT_WINDOW_SECONDS)


@router.post("", response_model=ChatResponse)
async def chat(payload: ChatRequest, request: Request, db: AsyncSession = Depends(get_db)) -> ChatResponse:
    session_id = _resolve_session_id(payload.session_id)

    await _check_rate_limit(session_id)

    history = await chat_session.get_history(session_id)
    if not history:
        history = [{"role": "system", "content": SYSTEM_PROMPT}]

    history.append({"role": "user", "content": payload.message})

    try:
        reply_text = await _run_chat_loop(history, db)
    except RateLimitError:
        # Groq's own free-tier quota exhausted -- degrade gracefully instead of a raw 502
        logger.error("Groq rate limit hit for session %s", session_id)
        return ChatResponse(
            reply="We're getting a lot of chat traffic right now — please try again in a minute.",
            session_id=session_id,
        )
    except Exception as exc:
        logger.exception("Unhandled chat error for session %s", session_id)
        raise HTTPException(status_code=502, detail=f"chat_backend_error: {exc}") from exc

    await chat_session.save_history(session_id, history)

    return ChatResponse(reply=reply_text, session_id=session_id)


async def _create_completion_with_retry(history: list[dict], use_tools: bool = True):
    """Groq's llama-3.3-70b-versatile occasionally emits malformed tool-call
    syntax (tool_use_failed). Retry a couple of times; if it keeps happening,
    fall back to a plain completion (no tools) so the user still gets a reply."""
    groq = _require_groq()
    last_exc: Exception | None = None
    for _ in range(MAX_MALFORMED_RETRIES):
        try:
            kwargs = dict(model=GROQ_MODEL, messages=history, max_tokens=500, temperature=0.1)
            if use_tools:
                kwargs.update(tools=TOOL_SCHEMAS, tool_choice="auto")
            return await groq.chat.completions.create(**kwargs)
        except APIStatusError as exc:
            last_exc = exc
            logger.warning("APIStatusError on completion call: %s", exc)
            if "tool_use_failed" not in str(exc):
                raise

    # Still failing after retries -- fall back to a tool-less completion so we
    # at least return something instead of a hard error.
    if use_tools:
        return await groq.chat.completions.create(
            model=GROQ_MODEL, messages=history, max_tokens=500, temperature=0.1
        )
    raise last_exc


async def _run_chat_loop(history: list[dict], db: AsyncSession) -> str:
    for hop in range(MAX_TOOL_HOPS):
        completion = await _create_completion_with_retry(history)
        choice = completion.choices[0].message

        if not choice.tool_calls:
            reply = _sanitize_reply(choice.content)
            logger.info("hop %d: final answer -> %r (raw: %r)", hop, reply, choice.content)
            history.append({"role": "assistant", "content": reply})
            return reply

        history.append(
            {
                "role": "assistant",
                "content": choice.content or "",
                "tool_calls": [tc.model_dump() for tc in choice.tool_calls],
            }
        )

        for tool_call in choice.tool_calls:
            fn_name = tool_call.function.name
            fn = TOOL_IMPLEMENTATIONS.get(fn_name)

            try:
                fn_args = json.loads(tool_call.function.arguments or "{}")
                if fn is None:
                    result = {"error": f"unknown_tool:{fn_name}"}
                else:
                    result = await fn(db, **fn_args)
            except Exception as exc:
                # A single bad tool call (malformed args, DB hiccup, etc.) shouldn't
                # crash the whole turn -- feed the error back so the model can
                # apologize/rephrase instead of the user getting a 502.
                logger.exception("Tool execution failed: %s", fn_name)
                result = {"error": "tool_execution_failed"}

            logger.info("hop %d: tool=%s args=%s -> %s", hop, fn_name, tool_call.function.arguments, result)

            history.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result, default=str),
                }
            )

    logger.warning("hit MAX_TOOL_HOPS (%d) without a final answer", MAX_TOOL_HOPS)
    return "Sorry, I'm having trouble with that request right now — could you rephrase, or would you like me to connect you to support?"