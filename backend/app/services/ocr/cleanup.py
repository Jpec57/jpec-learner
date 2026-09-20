import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from app.core.config import settings
from app.db.base import AsyncSessionLocal
from app.models.ocr_scan import OcrScan
from app.services.ocr.temp_storage import stale_temp_files

logger = logging.getLogger(__name__)


async def cleanup_stale_scans(
    max_age_minutes: float, dry_run: bool = False, session_factory=AsyncSessionLocal
) -> tuple[int, int]:
    """Deletes OCR photos that were never dealt with: temp files older than
    max_age_minutes (all of them when 0) and the matching "pending" scan rows
    (r2_object_key IS NULL). Kept scans are never touched.
    Returns (temp files, pending rows) removed -- or that would be, if dry_run."""
    files = stale_temp_files(max_age_minutes * 60)
    if not dry_run:
        for path in files:
            path.unlink(missing_ok=True)

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)
    pending = (OcrScan.r2_object_key.is_(None), OcrScan.created_at <= cutoff)
    async with session_factory() as session:
        stale_ids: list[uuid.UUID] = list((await session.execute(select(OcrScan.id).where(*pending))).scalars())
        if stale_ids and not dry_run:
            await session.execute(delete(OcrScan).where(OcrScan.id.in_(stale_ids)))
            await session.commit()
    return len(files), len(stale_ids)


async def cleanup_stale_scans_in_background() -> None:
    """Housekeeping run after each /ocr/extract; must never surface an error to
    (or delay) the request that triggered it."""
    try:
        await cleanup_stale_scans(settings.ocr_temp_max_age_minutes)
    except Exception:
        logger.exception("OCR temp cleanup failed")