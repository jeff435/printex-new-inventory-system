"""
POST /admin-ai/chat        — the "second AI": privileged, tool-using assistant
                              for director / secretary / super_admin only.
GET  /admin-ai/providers    — which model(s) are actually configured
POST /admin-ai/extract-invoice — upload a PDF invoice, get back suggested
                              parts to add (preview by default; pass
                              auto_create=true to create them directly)

This is deliberately a SEPARATE router/module from app.chat — that one
(POST /chat) is the public, unauthenticated, read-only customer assistant.
This one requires login as staff and can both read privileged data
(payments, invoices, stats) and write (add_product). Keeping them as two
separate modules is the actual implementation of "two AIs": one public and
read-only, one internal and privileged — rather than one assistant with a
permission flag that's easy to misconfigure.
"""
import json
import logging
import uuid
import io
import inspect

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.deps import require_staff
from app.core.redis import redis_get, redis_set
from app.auth.models import User
from app.admin_ai.providers import create_completion, provider_status
from app.admin_ai.tools import TOOL_SCHEMAS, TOOL_IMPLEMENTATIONS, add_product
from app.admin_ai.mock_engine import run_mock

logger = logging.getLogger("printex.admin_ai")

router = APIRouter(prefix="/admin-ai", tags=["admin-ai"])

MAX_TOOL_HOPS = 5
SESSION_TTL = 60 * 60


def _session_key(session_id: str) -> str:
    return f"admin_ai_session:{session_id}"


SYSTEM_PROMPT = (
    "You are Printex's internal assistant, used only by directors, secretaries, and the super admin. "
    "You can look up stats, invoices, payments, and products, search the catalogue, flag data-quality "
    "issues, and add new products when given a clear name and price. Never invent a price, SKU, or "
    "number — ask the user for it if it's missing. Never claim you performed an action you didn't "
    "actually call a tool for. Keep answers short and direct; this is a busy staff member, not a "
    "casual chat."
)


class AdminChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    provider: str = "groq"  # "groq" or "xai" — see admin_ai.providers.PROVIDERS


class AdminChatResponse(BaseModel):
    reply: str
    session_id: str
    provider: str


@router.get("/providers")
async def get_providers(_: User = Depends(require_staff)):
    return provider_status()


@router.post("", response_model=AdminChatResponse)
async def admin_chat(
    payload: AdminChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    provider = payload.provider if payload.provider in ("groq", "xai", "mock") else "groq"
    session_id = payload.session_id or str(uuid.uuid4())

    history = await redis_get(_session_key(session_id)) or [{"role": "system", "content": SYSTEM_PROMPT}]
    history.append({"role": "user", "content": payload.message})

    try:
        if provider == "mock":
            # No LLM call at all — see mock_engine's own docstring for why.
            # History is still recorded so switching providers mid-session
            # doesn't lose context, but the mock engine itself is
            # stateless/rule-based per message, not a conversation.
            reply_text = await run_mock(payload.message, db)
            history.append({"role": "assistant", "content": reply_text})
        else:
            reply_text = await _run_admin_chat_loop(history, db, provider)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Admin AI error for session %s (user %s)", session_id, current_user.id)
        raise HTTPException(status_code=502, detail=f"admin_ai_error: {exc}") from exc

    await redis_set(_session_key(session_id), history, ttl=SESSION_TTL)
    return AdminChatResponse(reply=reply_text, session_id=session_id, provider=provider)


async def _run_admin_chat_loop(history: list[dict], db: AsyncSession, provider: str) -> str:
    for _ in range(MAX_TOOL_HOPS):
        message = await create_completion(provider, history, tools=TOOL_SCHEMAS)
        tool_calls = message.get("tool_calls")

        if not tool_calls:
            reply = message.get("content") or "I don't have anything to add on that."
            history.append({"role": "assistant", "content": reply})
            return reply

        history.append({
            "role": "assistant", "content": message.get("content"),
            "tool_calls": [{"id": tc["id"], "type": "function", "function": tc["function"]} for tc in tool_calls],
        })

        for tc in tool_calls:
            name = tc["function"]["name"]
            try:
                args = json.loads(tc["function"]["arguments"] or "{}")
            except json.JSONDecodeError:
                args = {}

            impl = TOOL_IMPLEMENTATIONS.get(name)
            if not impl:
                result = {"error": f"Unknown tool '{name}'"}
            else:
                try:
                    # Tools that need a DB session take `db` as their first
                    # positional arg (see admin_ai.tools) — the two web-search
                    # placeholders don't, so we only pass it when the tool
                    # implementation actually declares it.
                    sig = inspect.signature(impl)
                    if "db" in sig.parameters:
                        result = await impl(db, **args)
                    else:
                        result = await impl(**args)
                except Exception as exc:
                    logger.exception("Admin AI tool '%s' failed", name)
                    result = {"error": str(exc)}

            history.append({"role": "tool", "tool_call_id": tc["id"], "content": json.dumps(result, default=str)})

    # Ran out of hops — surface whatever the model last said rather than a dead end.
    fallback = "I wasn't able to finish that in the allotted steps — try breaking the request into smaller parts."
    history.append({"role": "assistant", "content": fallback})
    return fallback


@router.post("/extract-invoice")
async def extract_invoice(
    file: UploadFile = File(...),
    provider: str = Form("groq"),
    auto_create: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Upload a PDF invoice/quote from a supplier and get back a list of
    parts it mentions, ready to add to the catalogue. Preview-only by
    default (auto_create=False) — set auto_create=true to create every
    extracted line directly as a product, no review step.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF invoices are supported right now — image OCR needs a vision-capable model "
                   "and isn't wired up yet. Export or scan the invoice to PDF first.",
        )

    import pdfplumber

    raw = await file.read()
    try:
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Couldn't read that PDF: {exc}")

    if not text.strip():
        raise HTTPException(status_code=422, detail="No readable text found in that PDF — it may be a scanned image with no text layer.")

    extraction_prompt = (
        "Extract every distinct part/product line from this invoice text. "
        "Respond with ONLY a JSON array, no other text, of objects shaped like: "
        '{"name": str, "part_number": str or null, "sku": str, "price_kes": number, "quantity": number}. '
        "Make up a short SKU from the name if none is given (e.g. 'HYD-VALVE-001'). "
        "If a price genuinely isn't stated for a line, use 0 for price_kes.\n\n"
        f"INVOICE TEXT:\n{text[:6000]}"
    )
    if provider == "mock" or provider not in ("groq", "xai"):
        raise HTTPException(
            status_code=400,
            detail="Reading an invoice and pulling out part names/prices needs a real AI model — "
                   "offline mode can't do this. Switch to Groq or xAI Grok in the assistant's model picker first.",
        )
    message = await create_completion(provider, [{"role": "user", "content": extraction_prompt}])
    raw_content = message.get("content") or "[]"

    try:
        start, end = raw_content.index("["), raw_content.rindex("]") + 1
        parts = json.loads(raw_content[start:end])
    except (ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=502, detail="The AI's response couldn't be parsed as a part list — try again.")

    if not auto_create:
        return {"preview": parts, "created": False, "count": len(parts)}

    created, errors = [], []
    for p in parts:
        try:
            result = await add_product(
                db, name=p.get("name", "Unnamed part"), sku=p.get("sku") or f"AI-{uuid.uuid4().hex[:8]}",
                price_kes=p.get("price_kes", 0), part_number=p.get("part_number"),
            )
            (errors if "error" in result else created).append(result)
        except Exception as exc:
            errors.append({"name": p.get("name"), "error": str(exc)})

    return {"created_products": created, "errors": errors, "created": True, "count": len(created)}
