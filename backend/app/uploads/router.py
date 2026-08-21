import io
import uuid

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, File, Query, UploadFile
from PIL import Image, UnidentifiedImageError

from app.auth.models import User
from app.config import settings
from app.core.deps import require_manager
from app.core.exceptions import AppException, ValidationError
from app.core.storage import get_r2_client, public_url_for_key

router = APIRouter(prefix="/uploads", tags=["Uploads"])

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ("jpg", "JPEG"),
    "image/png": ("png", "PNG"),
    "image/webp": ("webp", "WEBP"),
}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED_FOLDERS = {"products", "categories", "brands"}
MAX_DIMENSION = 2000


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    folder: str = Query("products", description="products | categories | brands"),
    _: User = Depends(require_manager),
):
    if folder not in ALLOWED_FOLDERS:
        raise ValidationError(
            f"folder must be one of: {', '.join(sorted(ALLOWED_FOLDERS))}"
        )

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise ValidationError("Only JPEG, PNG or WEBP images are allowed")

    raw = await file.read()
    if not raw:
        raise ValidationError("Uploaded file is empty")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ValidationError("Image must be smaller than 5MB")

    try:
        probe = Image.open(io.BytesIO(raw))
        probe.verify()
        img = Image.open(io.BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise ValidationError("File is not a valid image")

    ext, save_format = ALLOWED_IMAGE_TYPES[file.content_type]

    if max(img.size) > MAX_DIMENSION:
        img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)
    if save_format == "JPEG" and img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGB")

    buffer = io.BytesIO()
    save_kwargs = {"optimize": True}
    if save_format in ("JPEG", "WEBP"):
        save_kwargs["quality"] = 88
    img.save(buffer, format=save_format, **save_kwargs)
    buffer.seek(0)

    key = f"{folder}/{uuid.uuid4()}.{ext}"

    try:
        client = get_r2_client()
        client.put_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=key,
            Body=buffer.getvalue(),
            ContentType=file.content_type,
            CacheControl="public, max-age=31536000, immutable",
        )
    except (BotoCoreError, ClientError) as exc:
        raise AppException(
            502, f"Failed to upload image to storage: {exc}", "UPLOAD_FAILED"
        )

    return {"url": public_url_for_key(key), "key": key}
