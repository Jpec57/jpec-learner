import time
import uuid
from pathlib import Path

from starlette.concurrency import run_in_threadpool

from app.core.config import settings

# Source photos live here only between /ocr/extract and the moment the user
# either keeps them (uploaded to R2, see r2_storage) or drops them. Anything
# left behind is swept by scripts/cleanup_ocr_temp.py.
TEMP_SUFFIX = ".img"


def temp_dir() -> Path:
    return Path(settings.ocr_temp_dir)


def temp_path(scan_id: uuid.UUID) -> Path:
    return temp_dir() / f"{scan_id}{TEMP_SUFFIX}"


def _write_sync(scan_id: uuid.UUID, raw: bytes) -> None:
    temp_dir().mkdir(parents=True, exist_ok=True)
    temp_path(scan_id).write_bytes(raw)


async def save_temp_image(scan_id: uuid.UUID, raw: bytes) -> None:
    await run_in_threadpool(_write_sync, scan_id, raw)


async def read_temp_image(scan_id: uuid.UUID) -> bytes | None:
    """The stored photo, or None if it was already deleted (or swept)."""
    path = temp_path(scan_id)
    try:
        return await run_in_threadpool(path.read_bytes)
    except FileNotFoundError:
        return None


def delete_temp_image(scan_id: uuid.UUID) -> None:
    temp_path(scan_id).unlink(missing_ok=True)


def stale_temp_files(max_age_seconds: float) -> list[Path]:
    """Temp photos last modified more than max_age_seconds ago (all of them
    when it is 0)."""
    directory = temp_dir()
    if not directory.is_dir():
        return []
    cutoff = time.time() - max_age_seconds
    return [
        path
        for path in directory.glob(f"*{TEMP_SUFFIX}")
        if path.is_file() and path.stat().st_mtime <= cutoff
    ]
