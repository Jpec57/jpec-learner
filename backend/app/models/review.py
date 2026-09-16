import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ReviewState(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "review_states"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(card_id, lesson_node_id) = 1", name="ck_review_states_single_target"
        ),
        Index(
            "ix_review_states_user_card_uniq",
            "user_id",
            "card_id",
            unique=True,
            postgresql_where=text("card_id IS NOT NULL"),
        ),
        Index(
            "ix_review_states_user_lesson_uniq",
            "user_id",
            "lesson_node_id",
            unique=True,
            postgresql_where=text("lesson_node_id IS NOT NULL"),
        ),
        Index("ix_review_states_user_due", "user_id", "due_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    card_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cards.id", ondelete="CASCADE"), nullable=True
    )
    lesson_node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hierarchy_nodes.id", ondelete="CASCADE"), nullable=True
    )
    repetitions: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    ease_factor: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=2.5, server_default="2.5")
    interval_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_rating: Mapped[int | None] = mapped_column(SmallInteger)
    current_level: Mapped[int] = mapped_column(
        SmallInteger,
        ForeignKey("level_definitions.level"),
        nullable=False,
        default=1,
        server_default="1",
    )


class ReviewLog(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "review_logs"

    review_state_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("review_states.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    quality: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    interval_before: Mapped[int] = mapped_column(Integer, nullable=False)
    interval_after: Mapped[int] = mapped_column(Integer, nullable=False)
    ease_before: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False)
    ease_after: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
