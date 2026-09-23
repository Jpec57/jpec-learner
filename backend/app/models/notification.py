import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class PushSubscription(UUIDPrimaryKeyMixin, Base):
    """Web Push subscription. Persists what a browser hands back from
    `PushManager.subscribe()`; read by app.services.push's hourly due-review
    digest job to send notifications."""

    __tablename__ = "push_subscriptions"
    __table_args__ = (UniqueConstraint("endpoint", name="uq_push_subscriptions_endpoint"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    p256dh_key: Mapped[str] = mapped_column(Text, nullable=False)
    auth_key: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class NotificationState(UUIDPrimaryKeyMixin, Base):
    """Tracks the last time a user was sent a due-review push, so the digest
    job (app.services.push.run_due_digest) can cap sends to once per day per
    user even though it checks due counts hourly."""

    __tablename__ = "notification_states"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    last_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
