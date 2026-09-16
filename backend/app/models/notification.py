import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class PushSubscription(UUIDPrimaryKeyMixin, Base):
    """Web Push subscription scaffolding (Phase 7). Nothing sends notifications
    yet -- no scheduler/cron exists. This just persists what a browser hands
    back from `PushManager.subscribe()` so a future digest job has somewhere
    to read from."""

    __tablename__ = "push_subscriptions"
    __table_args__ = (UniqueConstraint("endpoint", name="uq_push_subscriptions_endpoint"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    p256dh_key: Mapped[str] = mapped_column(Text, nullable=False)
    auth_key: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
