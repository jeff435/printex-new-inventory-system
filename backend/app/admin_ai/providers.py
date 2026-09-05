"""
Two model providers, one interface. Both Groq and xAI Grok speak the same
OpenAI-compatible chat-completions + tool-calling shape, so the rest of
this module never needs to know which one is actually answering.

Neither key is required for the app to boot — same reasoning as
app.chat.router.GROQ_API_KEY: constructing a client with a missing key at
import time previously coupled "no key set" to "the whole API is down",
which took /auth/login down with it on any fresh deploy. Both clients here
are built lazily and only raise when someone actually tries to use the
missing one.
"""
import os
import httpx
from groq import AsyncGroq
from fastapi import HTTPException

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = "llama-3.3-70b-versatile"

# xAI's API is intentionally OpenAI-compatible (same request/response shape
# as Groq's), so no separate SDK is needed — a plain httpx POST is enough.
XAI_API_KEY = os.getenv("XAI_API_KEY", "")
XAI_MODEL = "grok-4"
XAI_BASE_URL = "https://api.x.ai/v1"

_groq_client: "AsyncGroq | None" = AsyncGroq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

PROVIDERS = {"groq": "Groq (llama-3.3-70b)", "xai": "xAI Grok"}


def provider_status() -> dict:
    """What the frontend's model switcher shows — which provider(s) are
    actually usable right now, so a director/secretary/admin never picks
    one that's unconfigured and gets a confusing failure mid-conversation."""
    return {
        "groq": {"label": PROVIDERS["groq"], "available": bool(GROQ_API_KEY)},
        "xai": {"label": PROVIDERS["xai"], "available": bool(XAI_API_KEY)},
    }


async def create_completion(provider: str, messages: list[dict], tools: list[dict] | None = None) -> dict:
    """Returns a plain dict shaped like OpenAI's
    choices[0].message {content, tool_calls} — the one normalization point
    both callers (the admin chat loop and the invoice extractor) build on,
    so neither has to know which provider actually answered.
    """
    if provider == "xai":
        if not XAI_API_KEY:
            raise HTTPException(
                status_code=503,
                detail="xAI Grok isn't configured on this server yet — set XAI_API_KEY and restart the backend.",
            )
        async with httpx.AsyncClient(timeout=60) as http:
            resp = await http.post(
                f"{XAI_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {XAI_API_KEY}"},
                json={
                    "model": XAI_MODEL,
                    "messages": messages,
                    **({"tools": tools, "tool_choice": "auto"} if tools else {}),
                },
            )
            resp.raise_for_status()
            data = resp.json()
        return data["choices"][0]["message"]

    # Default / fallback: Groq — matches app.chat.router's existing pattern.
    if not _groq_client:
        raise HTTPException(
            status_code=503,
            detail="Groq isn't configured on this server (GROQ_API_KEY is unset).",
        )
    kwargs = {"model": GROQ_MODEL, "messages": messages}
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"
    completion = await _groq_client.chat.completions.create(**kwargs)
    msg = completion.choices[0].message
    return {
        "content": msg.content,
        "tool_calls": [
            {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
            for tc in (msg.tool_calls or [])
        ] if msg.tool_calls else None,
    }
