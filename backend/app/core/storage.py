"""
Cloudflare R2 storage client.

R2 is S3-compatible, so we talk to it with boto3's regular 's3' client —
just pointed at R2's account-scoped endpoint instead of AWS.
"""
import boto3
from botocore.config import Config

from app.config import settings


def get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def public_url_for_key(key: str) -> str:
    return f"{settings.R2_PUBLIC_URL.rstrip('/')}/{key}"
