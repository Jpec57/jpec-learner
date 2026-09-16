import io
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from PIL import Image as PILImage, ImageOps

from app.core.config import settings

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


async def save_upload(
    upload: UploadFile, *, owner_id: uuid.UUID, kind: str
) -> tuple[str, str, int]:
    """Validate, re-encode (stripping EXIF orientation issues from phone camera
    captures), and persist an uploaded image. Returns (relative_path, content_type, size_bytes)."""
    if upload.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Unsupported image type: {upload.content_type}"
        )

    raw = await upload.read()
    if len(raw) > settings.max_image_size_bytes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Image too large")

    try:
        with PILImage.open(io.BytesIO(raw)) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=88)
            encoded = buffer.getvalue()
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not process image") from exc

    relative_dir = f"{kind}/{owner_id}"
    filename = f"{uuid.uuid4()}.jpg"
    relative_path = f"{relative_dir}/{filename}"

    target_dir = Path(settings.image_storage_path) / relative_dir
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / filename).write_bytes(encoded)

    return relative_path, "image/jpeg", len(encoded)


def delete_file(relative_path: str) -> None:
    path = Path(settings.image_storage_path) / relative_path
    path.unlink(missing_ok=True)
