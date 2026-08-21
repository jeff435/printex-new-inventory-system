import json
from typing import Any, Optional
import redis.asyncio as aioredis
from app.config import settings

# Global Redis pool
redis_client: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global redis_client
    if redis_client is None:
        redis_client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    return redis_client


async def redis_set(key: str, value: Any, ttl: int = 3600) -> None:
    r = await get_redis()
    await r.set(key, json.dumps(value), ex=ttl)


async def redis_get(key: str) -> Optional[Any]:
    r = await get_redis()
    val = await r.get(key)
    return json.loads(val) if val else None


async def redis_delete(key: str) -> None:
    r = await get_redis()
    await r.delete(key)


async def redis_close():
    global redis_client
    if redis_client:
        await redis_client.aclose()
        redis_client = None
