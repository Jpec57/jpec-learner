import uuid

from sqlalchemy import CheckConstraint, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin

LLM_PROVIDERS = ("gemini", "claude", "chatgpt")


class LLMCredential(TimestampMixin, Base):
    """One row per user -- a user has at most one configured assistant
    provider/key at a time, swapped by overwriting this row rather than
    juggling several stored keys."""

    __tablename__ = "llm_credentials"
    __table_args__ = (CheckConstraint("provider IN ('gemini', 'claude', 'chatgpt')", name="ck_llm_credentials_provider"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    encrypted_api_key: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str | None] = mapped_column(String(80), nullable=True)
