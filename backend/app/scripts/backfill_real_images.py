"""
Backfill script — downloads one real, freely-licensed photo per product
category from Unsplash, re-uploads it to your own R2 bucket, then assigns
it to every category/product that currently has no image.

All photos below are plain (non-Unsplash+) images, free to use and
redistribute commercially under the Unsplash License
(https://unsplash.com/license) — same licensing basis already used by
HeroBanner.tsx elsewhere in this app.

Safe to re-run: only touches products/categories where the image field is
still NULL, so it won't overwrite real product photos you add later
through the admin upload panel.

Usage (from inside the backend container or venv):
    python -m app.scripts.backfill_real_images
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
import app.main  # noqa: F401 — registers all models (Order, OrderItem, etc.) before querying

# category name -> a real, verified Unsplash photo URL (free tier)
CATEGORY_SOURCE_PHOTOS = {
    "Fruits & Vegetables":  "https://images.unsplash.com/photo-1610832958506-aa56368176cf",
    "Dairy & Eggs":         "https://images.unsplash.com/photo-1563636619-e9143da7973b",
    "Bakery":               "https://images.unsplash.com/photo-1509440159596-0249088772ff",
    "Beverages":            "https://images.unsplash.com/photo-1524802020103-aa46eaffcaa2",
    "Grains & Cereals":     "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b",
    "Snacks":               "https://images.unsplash.com/photo-1599490659213-e2b9527bd087",
    "Household & Cleaning": "https://images.unsplash.com/photo-1563453392212-326f5e854473",
    "Personal Care":        "https://images.unsplash.com/photo-1713434638446-13b4a15b728e",
}
DOWNLOAD_PARAMS = "?w=1000&h=1000&fit=crop&q=80&fm=jpg"
MAX_DIMENSION = 1000


def download_and_process(source_url: str) -> bytes:
    """Downloads the source photo and re-encodes it as a clean JPEG."""
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


def upload_category_photo(client, slug: str, body: bytes) -> str:
    key = f"categories/{slug}.jpg"
    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=body,
        ContentType="image/jpeg",
        CacheControl="public, max-age=31536000, immutable",
    )
    return public_url_for_key(key)


async def backfill():
    client = get_r2_client()

    async with AsyncSessionLocal() as db:
        categories = (await db.execute(select(Category))).scalars().all()

        category_image_url: dict[str, str] = {}
        print("Downloading & uploading real category photos...")
        for cat in categories:
            source = CATEGORY_SOURCE_PHOTOS.get(cat.name)
            if not source:
                print(f"   ⚠️  No source photo mapped for '{cat.name}', skipping")
                continue
            body = download_and_process(source)
            url = upload_category_photo(client, cat.slug, body)
            category_image_url[cat.id] = url
            print(f"   {cat.name:24s} -> {url}")
            if not cat.image_url:
                cat.image_url = url

        # Fallback for any product with no category at all — reuse the
        # first successfully-uploaded category photo rather than leaving
        # it blank.
        default_url = next(iter(category_image_url.values()), None)

        products = (
            await db.execute(select(Product).where(Product.thumbnail_url.is_(None)))
        ).scalars().all()

        updated = 0
        for product in products:
            url = category_image_url.get(product.category_id, default_url)
            if url:
                product.thumbnail_url = url
                updated += 1

        await db.commit()

        print()
        print(f"✅ Backfill complete: {updated} product(s) now have a real category photo.")


if __name__ == "__main__":
    asyncio.run(backfill())