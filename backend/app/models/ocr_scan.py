import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

OCR_MODES = ("general", "manga")


class OcrScan(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A photographed image sent through the self-hosted OCR pipeline.

    Created "pending" at extract time: the photo only exists as a temp file
    (services/ocr/temp_storage) and r2_object_key is NULL. If the user asks to
    keep it, linking the scan to a card_id / lesson_node_id uploads the photo to
    R2 (setting r2_object_key) as source-photo context. Otherwise the pending
    row and its temp file are deleted."""

    __tablename__ = "ocr_scans"
    __table_args__ = (CheckConstraint("mode IN ('general', 'manga')", name="ck_ocr_scans_mode"),)

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    card_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cards.id", ondelete="CASCADE"), nullable=True, index=True
    )
    lesson_node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hierarchy_nodes.id", ondelete="CASCADE"), nullable=True, index=True
    )
    r2_object_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    mode: Mapped[str] = mapped_column(String(20), nullable=False)
    extracted_text: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(80))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
