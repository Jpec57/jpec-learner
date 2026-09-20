"""Deletes OCR source photos that were never dealt with.

/ocr/extract keeps the photo as a temp file (settings.ocr_temp_dir) until the
user keeps it (uploaded to R2) or drops it (deleted). Abandoned forms, closed
tabs and failed requests leave both the temp file and a "pending" ocr_scans row
(r2_object_key IS NULL) behind; this removes them. Kept scans are never touched.

The same cleanup already runs in the background after every /ocr/extract
request (for leftovers older than OCR_TEMP_MAX_AGE_MINUTES); use this script to
purge on demand or on a schedule. Run it from the backend container:

    # Purge leftovers older than the default max age (safe while users are scanning)
    python -m scripts.cleanup_ocr_temp

    # Purge everything, regardless of age
    python -m scripts.cleanup_ocr_temp --max-age-minutes 0

    # Show what would be deleted
    python -m scripts.cleanup_ocr_temp --dry-run
"""

import argparse
import asyncio

from app.core.config import settings
from app.db.base import engine
from app.services.ocr.cleanup import cleanup_stale_scans
from app.services.ocr.temp_storage import temp_dir


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--max-age-minutes",
        type=float,
        default=settings.ocr_temp_max_age_minutes,
        help="only delete leftovers at least this old; 0 deletes all of them (default: %(default)s)",
    )
    parser.add_argument("--dry-run", action="store_true", help="report what would be deleted without deleting")
    args = parser.parse_args()

    try:
        files, rows = await cleanup_stale_scans(args.max_age_minutes, args.dry_run)
    finally:
        await engine.dispose()

    verb = "Would delete" if args.dry_run else "Deleted"
    print(f"{verb} {files} temp photo(s) in {temp_dir()} and {rows} pending scan row(s).")


if __name__ == "__main__":
    asyncio.run(main())
