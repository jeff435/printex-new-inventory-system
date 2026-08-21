"""
Chat session storage — thin wrapper around app.core.redis's existing
redis_get/redis_set/redis_delete helpers (which already handle JSON).
"""
from typing import Any

from app.core.redis import redis_get, redis_set, redis_delete

SESSION_TTL = 60 * 60  # 1 hour
MAX_HISTORY_MESSAGES = 20


def _key(session_id: str) -> str:
    return f"chat_session:{session_id}"


async def get_history(session_id: str) -> list[dict[str, Any]]:
    value = await redis_get(_key(session_id))
    return value or []


async def save_history(session_id: str, messages: list[dict[str, Any]]) -> None:
    if len(messages) > MAX_HISTORY_MESSAGES:
        head = messages[:1] if messages and messages[0]["role"] == "system" else []
        tail = messages[-(MAX_HISTORY_MESSAGES - len(head)):]
        messages = head + tail

    await redis_set(_key(session_id), messages, ttl=SESSION_TTL)


async def clear_history(session_id: str) -> None:
    await redis_delete(_key(session_id))