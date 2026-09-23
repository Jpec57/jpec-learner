import json
import logging
from datetime import datetime, timedelta, timezone

from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import AsyncSessionLocal
from app.models.notification import NotificationState, PushSubscription
from app.models.user import User
from app.services.progression import due_counts_for_subscribed_users

logger = logging.getLogger(__name__)

NOTIFY_COOLDOWN = timedelta(hours=24)


async def send_push_to_user(db: AsyncSession, user: User, payload: dict) -> None:
    """Sends payload to every subscription the user has registered. A dead
    subscription (404/410 -- unsubscribed or expired) is removed; any other
    failure is logged and skipped so it never blocks the rest of the batch."""
    subscriptions = list(
        (await db.execute(select(PushSubscription).where(PushSubscription.user_id == user.id))).scalars()
    )
    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh_key, "auth": sub.auth_key},
                },
                data=json.dumps(payload),
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
            )
        except WebPushException as exc:
            status_code = exc.response.status_code if exc.response is not None else None
            if status_code in (404, 410):
                await db.delete(sub)
            else:
                logger.warning("Push send failed for subscription %s: %s", sub.id, exc)
    await db.commit()


async def run_due_digest(session_factory=AsyncSessionLocal) -> None:
    """Hourly job: for every user with a push subscription and at least one
    due review, send a push -- but at most once every 24h per user, even if
    the due count keeps growing within that window."""
    async with session_factory() as db:
        due_counts = await due_counts_for_subscribed_users(db)
        due_user_ids = [user_id for user_id, count in due_counts.items() if count > 0]
        if not due_user_ids:
            return

        users = list((await db.execute(select(User).where(User.id.in_(due_user_ids)))).scalars())
        states = {
            state.user_id: state
            for state in (
                await db.execute(select(NotificationState).where(NotificationState.user_id.in_(due_user_ids)))
            ).scalars()
        }

        now = datetime.now(timezone.utc)
        for user in users:
            state = states.get(user.id)
            already_notified_recently = (
                state is not None
                and state.last_notified_at is not None
                and now - state.last_notified_at < NOTIFY_COOLDOWN
            )
            if already_notified_recently:
                continue

            count = due_counts[user.id]
            await send_push_to_user(
                db,
                user,
                {"title": "Reviews ready", "body": f"{count} card(s) due for review.", "url": "/"},
            )

            if state is None:
                state = NotificationState(user_id=user.id, last_notified_at=now)
                db.add(state)
            else:
                state.last_notified_at = now
        await db.commit()


async def run_due_digest_job() -> None:
    """APScheduler entry point -- must never raise, or the scheduler stops
    rescheduling the job."""
    try:
        await run_due_digest()
    except Exception:
        logger.exception("run_due_digest failed")
