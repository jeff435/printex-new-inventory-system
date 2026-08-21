"""
One-off fix: replaces the photo for specific categories (and every product
in that category) with a better-matched real photo — unlike the general
backfill script, this DOES overwrite existing values, but only for the
categories listed in OVERRIDES below.

Usage:
    python -m app.scripts.fix_category_photos
"""
import asyncio
import io

import requests
from sqlalchemy import select
from PIL import Image

from app.database import AsyncSessionLocal
from app.config import settings
from app.core.storage import get_r2_client, public_url_for_key
from app.products.models import Category, Product
import app.main  # noqa: F401 — registers all models before querying

OVERRIDES = {
    "Dairy & Eggs": "https://images.unsplash.com/photo-1552593050-477020c5af3f",
    "Beverages":    "https://images.unsplash.com/photo-1649550275607-e0835d18a9a7",
}
DOWNLOAD_PARAMS = "?w=1000&h=1000&fit=crop&q=80&fm=jpg"
MAX_DIMENSION = 1000


def download_and_process(source_url: str) -> bytes:
    resp = requests.get(source_url + DOWNLOAD_PARAMS, timeout=20)
    resp.raise_for_status()
    img = Image.open(io.BytesIO(resp.content))
    if img.mode != "RGB":
        img = img.convert("RGB")
    if max(img.size) > MAX_DIMENSION:
        img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=88, optimize=True)
    return buffer.getvalue()


async def fix():
    client = get_r2_client()

    async with AsyncSessionLocal() as db:
        categories = (await db.execute(select(Category))).scalars().all()

        for cat in categories:
            source = OVERRIDES.get(cat.name)
            if not source:
                continue

            body = download_and_process(source)
            key = f"categories/{cat.slug}.jpg"
            client.put_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=key,
                Body=body,
                ContentType="image/jpeg",
                CacheControl="public, max-age=31536000, immutable",
            )
            new_url = public_url_for_key(key)
            cat.image_url = new_url
            print(f"Updated category '{cat.name}' -> {new_url}")

            products = (
                await db.execute(select(Product).where(Product.category_id == cat.id))
            ).scalars().all()
            for product in products:
                product.thumbnail_url = new_url
            print(f"   -> {len(products)} product(s) in this category updated")

        await db.commit()
        print("\nDone.")


if __name__ == "__main__":
    asyncio.run(fix())