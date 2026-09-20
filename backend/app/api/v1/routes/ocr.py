import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.card import Card
from app.models.hierarchy import HierarchyNode
from app.models.ocr_scan import OcrScan
from app.models.user import User
from app.schemas.ocr import OcrMode, OcrScanLink, OcrScanOut
from app.services.image_storage import ALLOWED_CONTENT_TYPES
from app.services.ocr.cleanup import cleanup_stale_scans_in_background
from app.services.ocr.client import OcrServiceError, extract_text
from app.services.ocr.r2_storage import OcrStorageNotConfiguredError, presigned_scan_url, upload_scan_image
from app.services.ocr.temp_storage import delete_temp_image, read_temp_image, save_temp_image

router = APIRouter(prefix="/ocr", tags=["ocr"])


async def _scan_to_out(scan: OcrScan) -> OcrScanOut:
    # Pending scans (photo not kept) have nothing in R2 to link to.
    image_url = await presigned_scan_url(scan.r2_object_key) if scan.r2_object_key else None
    return OcrScanOut(
        id=scan.id,
        mode=scan.mode,
        text=scan.extracted_text,
        image_url=image_url,
        card_id=scan.card_id,
        lesson_node_id=scan.lesson_node_id,
        created_at=scan.created_at,
    )


@router.post("/extract", response_model=OcrScanOut, status_code=status.HTTP_201_CREATED)
async def extract(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    mode: OcrMode = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unsupported image type: {file.content_type}")

    raw = await file.read()
    if len(raw) > settings.max_image_size_bytes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Image too large")

    try:
        text = await extract_text(raw, mode=mode, content_type=file.content_type)
    except OcrServiceError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    # The photo stays a local temp file; it only goes to R2 if the user keeps it
    # (see link_scan) and is deleted otherwise (see discard_scan / the cleanup script).
    scan = OcrScan(
        owner_id=current_user.id,
        mode=mode,
        extracted_text=text,
        content_type="image/jpeg",
    )
    db.add(scan)
    await db.flush()
    try:
        await save_temp_image(scan.id, raw)
    except OSError:
        await db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Couldn't store the photo temporarily")
    await db.commit()
    await db.refresh(scan)
    # Sweep photos abandoned by earlier scans; runs after the response is sent.
    background_tasks.add_task(cleanup_stale_scans_in_background)
    return await _scan_to_out(scan)


@router.patch("/scans/{scan_id}/link", response_model=OcrScanOut)
async def link_scan(
    scan_id: uuid.UUID,
    payload: OcrScanLink,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if (payload.card_id is None) == (payload.lesson_node_id is None):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provide exactly one of card_id or lesson_node_id")

    scan = await db.get(OcrScan, scan_id)
    if scan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scan not found")
    if scan.owner_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not the owner")

    if payload.card_id is not None:
        card = await db.get(Card, payload.card_id)
        if card is None or card.owner_id != current_user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
        scan.card_id = payload.card_id
    else:
        node = await db.get(HierarchyNode, payload.lesson_node_id)
        if node is None or node.owner_id != current_user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")
        scan.lesson_node_id = payload.lesson_node_id

    # Linking is the user's "keep this photo" decision: move it from the temp
    # file to R2. Already-kept scans (re-link) have nothing left to upload.
    pending = scan.r2_object_key is None
    if pending:
        raw = await read_temp_image(scan.id)
        if raw is None:
            raise HTTPException(status.HTTP_410_GONE, "The photo is no longer available")
        try:
            scan.r2_object_key, scan.size_bytes = await upload_scan_image(raw, owner_id=current_user.id)
        except OcrStorageNotConfiguredError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    await db.commit()
    await db.refresh(scan)
    if pending:
        delete_temp_image(scan.id)
    return await _scan_to_out(scan)


@router.delete("/scans/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def discard_scan(
    scan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Drops a scan whose photo the user doesn't want to keep: removes the temp
    file and the pending row. Scans already kept (uploaded) are left alone."""
    scan = await db.get(OcrScan, scan_id)
    if scan is None or scan.owner_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scan not found")
    if scan.r2_object_key is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Scan was already kept")

    await db.delete(scan)
    await db.commit()
    delete_temp_image(scan_id)


@router.get("/scans", response_model=list[OcrScanOut])
async def list_scans(
    card_id: uuid.UUID | None = None,
    lesson_node_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if (card_id is None) == (lesson_node_id is None):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provide exactly one of card_id or lesson_node_id")

    stmt = select(OcrScan).where(OcrScan.owner_id == current_user.id, OcrScan.r2_object_key.is_not(None))
    stmt = stmt.where(OcrScan.card_id == card_id) if card_id is not None else stmt.where(
        OcrScan.lesson_node_id == lesson_node_id
    )
    result = await db.execute(stmt)
    scans = result.scalars().all()
    return [await _scan_to_out(scan) for scan in scans]
