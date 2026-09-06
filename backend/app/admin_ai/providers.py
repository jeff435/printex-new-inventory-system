"""
Three real model providers plus one offline fallback, one interface. Groq,
xAI Grok, and Gemini all speak (or can speak) the same OpenAI-compatible
chat-completions + tool-calling shape, so the rest of this module never
needs to know which one is actually answering.

No key is required for the app to boot — same reasoning as
app.chat.router.GROQ_API_KEY: constructing a client with a missing key at
import time previously coupled "no key set" to "the whole API is down",
which took /auth/login down with it on any fresh deploy. Every client here
is built lazily and only raises when someone actually tries to use the
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

# Google also publishes an OpenAI-compatible endpoint for Gemini (same
# request/response shape as the two above), so this needs no separate SDK
# either. Get a free key at https://aistudio.google.com/apikey — Gemini's
# free tier is generally the most generous of the three paid options here,
# worth trying first if cost is the concern.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-2.0-flash"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"

# Ollama runs a real open-source model directly on your own machine — free,
# no signup, no API key, and works with the internet fully disconnected
# once the model is downloaded. This is the honest way to get "smart like
# Gemini" without any cloud account: it's a real LLM, just running
# locally instead of in someone else's data center. It DOES need a
# one-time setup step you have to do yourself (see OLLAMA_SETUP_NOTE
# below) — there's no way around installing something somewhere to get
# real language understanding for free.
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
# Explicit opt-in flag rather than just checking OLLAMA_BASE_URL's presence
# — the default URL above is always "set" even when Ollama was never
# installed, so without this flag the switcher would claim it's available
# and then fail confusingly on first use.
OLLAMA_ENABLED = os.getenv("OLLAMA_ENABLED", "").lower() in ("1", "true", "yes")

_groq_client: "AsyncGroq | None" = AsyncGroq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

PROVIDERS = {
    "groq": "Groq (llama-3.3-70b)",
    "xai": "xAI Grok",
    "gemini": "Google Gemini",
    "ollama": f"Local model — {OLLAMA_MODEL} (free, runs on your machine)",
    "mock": "Offline Assistant (no API key needed)",
}


def provider_status() -> dict:
    """What the frontend's model switcher shows — which provider(s) are
    actually usable right now, so a director/secretary/admin never picks
    one that's unconfigured and gets a confusing failure mid-conversation.
    "mock" is always available — it needs no key and no network call to
    any AI provider (see admin_ai.mock_engine) — so this assistant always
    has at least one working option even if every paid provider is down,
    unconfigured, or the API key was rejected.
    """
    return {
        "groq": {"label": PROVIDERS["groq"], "available": bool(GROQ_API_KEY)},
        "xai": {"label": PROVIDERS["xai"], "available": bool(XAI_API_KEY)},
        "gemini": {"label": PROVIDERS["gemini"], "available": bool(GEMINI_API_KEY)},
        "ollama": {"label": PROVIDERS["ollama"], "available": OLLAMA_ENABLED},
        "mock": {"label": PROVIDERS["mock"], "available": True},
    }


async def _openai_compatible_call(base_url: str, api_key: str, model: str, messages: list[dict], tools: list[dict] | None) -> dict:
    """Shared by xAI and Gemini — both are genuinely OpenAI-compatible REST
    APIs, so there's no reason to write this HTTP call twice."""
    async with httpx.AsyncClient(timeout=60) as http:
        resp = await http.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": messages,
                **({"tools": tools, "tool_choice": "auto"} if tools else {}),
            },
        )
        resp.raise_for_status()
        data = resp.json()
    return data["choices"][0]["message"]


async def create_completion(provider: str, messages: list[dict], tools: list[dict] | None = None) -> dict:
    """Returns a plain dict shaped like OpenAI's
    choices[0].message {content, tool_calls} — the one normalization point
    every caller (the admin chat loop and the invoice extractor) builds on,
    so none of them need to know which provider actually answered.
    """
    if provider == "xai":
        if not XAI_API_KEY:
            raise HTTPException(
                status_code=503,
                detail="xAI Grok isn't configured on this server yet — set XAI_API_KEY and restart the backend.",
            )
        return await _openai_compatible_call(XAI_BASE_URL, XAI_API_KEY, XAI_MODEL, messages, tools)

    if provider == "gemini":
        if not GEMINI_API_KEY:
            raise HTTPException(
                status_code=503,
                detail="Gemini isn't configured on this server yet — get a free key at "
                       "https://aistudio.google.com/apikey, set GEMINI_API_KEY, and restart the backend.",
            )
        return await _openai_compatible_call(GEMINI_BASE_URL, GEMINI_API_KEY, GEMINI_MODEL, messages, tools)

    if provider == "ollama":
        if not OLLAMA_ENABLED:
            raise HTTPException(
                status_code=503,
                detail="The local model isn't set up yet. Install Ollama (ollama.com — free), run "
                       f"'ollama pull {OLLAMA_MODEL}', then set OLLAMA_ENABLED=true in the backend's "
                       ".env and restart. No account or payment needed, just the one-time download.",
            )
        try:
            # Ollama's OpenAI-compatible endpoint doesn't check the
            # Authorization header at all, but _openai_compatible_call
            # always sends one — passing a placeholder here is harmless
            # and keeps this one function shared across all three real
            # providers instead of writing a near-duplicate for Ollama.
            return await _openai_compatible_call(OLLAMA_BASE_URL, "ollama", OLLAMA_MODEL, messages, tools)
        except httpx.ConnectError:
            raise HTTPException(
                status_code=503,
                detail="Can't reach Ollama — is it actually running? Try 'ollama serve' (or check it's "
                       "running as a service) on the machine the backend runs on.",
            )

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
