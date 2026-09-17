import uuid
from datetime import datetime

from sqlalchemy import ARRAY, Boolean, CheckConstraint, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.image import Image
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

ANSWER_MODES = ("reveal", "typed")


class Card(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "cards"
    __table_args__ = (CheckConstraint("answer_mode IN ('reveal', 'typed')", name="ck_cards_answer_mode"),)

    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lesson_node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hierarchy_nodes.id", ondelete="CASCADE"), nullable=True, index=True
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    front_text: Mapped[str] = mapped_column(Text, nullable=False)
    back_text: Mapped[str] = mapped_column(Text, nullable=False)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # "reveal": today's flip-and-self-rate flashcard. "typed": WaniKani-style --
    # the learner types back_text (in accepted_answers' language/script), graded
    # against accepted_answers before falling back to reveal-and-self-rate.
    answer_mode: Mapped[str] = mapped_column(Text, nullable=False, default="reveal", server_default="reveal")
    accepted_answers: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, default=list, server_default="{}"
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    images: Mapped[list["Image"]] = relationship(cascade="all, delete-orphan")
