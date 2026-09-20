import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


DECK_TYPES = ("general", "language", "scientific")


class Category(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "categories"
    __table_args__ = (
        CheckConstraint("deck_type IN ('general', 'language', 'scientific')", name="ck_categories_deck_type"),
    )

    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(80))
    # Hex color (e.g. "#8b5cf6") driving both the deck's retinted accent
    # (frontend derives light/dark variants from this single value) and its
    # optional background gradient. Null means "use the app's default theme".
    theme_color: Mapped[str | None] = mapped_column(String(7))
    # "language": card forms offer a source/target language and a translate
    # button. "scientific": lesson editors offer LaTeX shortcuts.
    deck_type: Mapped[str] = mapped_column(String(20), nullable=False, default="general", server_default="general")
    # A language deck's last-used direction (ISO codes, e.g. "fr" -> "en"),
    # preselected the next time a card is created.
    source_language: Mapped[str | None] = mapped_column(String(10))
    target_language: Mapped[str | None] = mapped_column(String(10))
    # The deck's long-term objective ("master the first-year CPGE maths
    # programme") and the user-authored markdown plan that breaks it down.
    # Sub-goals are parsed from the plan's headings on read (services/plan.py),
    # never stored, so the markdown stays the single source of truth.
    goal: Mapped[str | None] = mapped_column(Text)
    plan_markdown: Mapped[str | None] = mapped_column(Text)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
