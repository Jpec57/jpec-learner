import io
import uuid
from functools import lru_cache

import boto3
from PIL import Image as PILImage, ImageOps
from starlette.concurrency import run_in_threadpool

from app.core.config import settings

PRESIGNED_URL_TTL_SECONDS = 3600


class OcrStorageNotConfiguredError(RuntimeError):
    """Raised when the R2 credentials are missing, so the route can answer with
    a readable 503 instead of an unhandled 500 (which also skips the CORS
    middleware and surfaces in the browser as a misleading CORS error)."""


@lru_cache(maxsize=1)
def _client():
    if not (settings.r2_account_id and settings.r2_access_key_id and settings.r2_secret_access_key):
        raise OcrStorageNotConfiguredError(
            "OCR image storage is not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY"
        )
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint_url,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
    )


def _reencode_jpeg(raw: bytes) -> bytes:
    with PILImage.open(io.BytesIO(raw)) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=88)
        return buffer.getvalue()


def _put_object_sync(object_key: str, body: bytes) -> None:
    _client().put_object(
        Bucket=settings.r2_bucket_name, Key=object_key, Body=body, ContentType="image/jpeg"
    )


def _presign_sync(object_key: str) -> str:
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.r2_bucket_name, "Key": object_key},
        ExpiresIn=PRESIGNED_URL_TTL_SECONDS,
    )


async def upload_scan_image(raw: bytes, *, owner_id: uuid.UUID) -> tuple[str, int]:
    """Re-encodes and uploads a source photo to the OCR scans bucket. Returns
    (object_key, size_bytes) -- the bucket stays private, so callers read the
    image back via presigned_scan_url rather than a stored public URL."""
    encoded = _reencode_jpeg(raw)
    object_key = f"{owner_id}/{uuid.uuid4()}.jpg"
    await run_in_threadpool(_put_object_sync, object_key, encoded)
    return object_key, len(encoded)


async def presigned_scan_url(object_key: str) -> str:
    return await run_in_threadpool(_presign_sync, object_key)
