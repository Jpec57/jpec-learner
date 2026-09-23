from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.notification import PushSubscription
from app.models.user import User
from app.schemas.notification import SubscribeRequest, VapidPublicKeyOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/vapid-public-key", response_model=VapidPublicKeyOut)
async def get_vapid_public_key():
    """Unauthenticated: the frontend needs this before a user is necessarily
    logged in (e.g. to feature-detect push support), and fetching it at
    runtime avoids a frontend rebuild whenever the VAPID keys rotate."""
    return VapidPublicKeyOut(public_key=settings.vapid_public_key)


@router.post("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def subscribe(
    payload: SubscribeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Persists a Web Push subscription, read by the hourly due-review digest
    job (see app.services.push)."""
    existing = await db.scalar(
        select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint)
    )
    if existing is not None:
        existing.user_id = current_user.id
        existing.p256dh_key = payload.keys.p256dh
        existing.auth_key = payload.keys.auth
    else:
        db.add(
            PushSubscription(
                user_id=current_user.id,
                endpoint=payload.endpoint,
                p256dh_key=payload.keys.p256dh,
                auth_key=payload.keys.auth,
            )
        )
    await db.commit()


@router.delete("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    endpoint: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.scalar(
        select(PushSubscription).where(
            PushSubscription.endpoint == endpoint, PushSubscription.user_id == current_user.id
        )
    )
    if existing is not None:
        await db.delete(existing)
        await db.commit()
