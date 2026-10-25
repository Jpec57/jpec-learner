import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class ChessLineProgress(UUIDPrimaryKeyMixin, Base):
    """How often a user finished one line of an opening course. Courses and
    lines are defined in the frontend (features/chess/openings.ts), so they are
    referenced here by their string ids."""

    __tablename__ = "chess_line_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", "line_id", name="uq_chess_line_progress_user_line"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    course_id: Mapped[str] = mapped_column(String(64), nullable=False)
    line_id: Mapped[str] = mapped_column(String(64), nullable=False)
    completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    flawless: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
