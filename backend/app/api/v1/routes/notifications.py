from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.notification import PushSubscription
from app.models.user import User
from app.schemas.notification import SubscribeRequest

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def subscribe(
    payload: SubscribeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Persists a Web Push subscription. Scaffolding only -- nothing reads this
    table yet (no scheduler/digest job exists). See PushSubscription docstring."""
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
