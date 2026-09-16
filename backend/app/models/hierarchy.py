import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import LtreeType
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class HierarchyNode(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "hierarchy_nodes"
    __table_args__ = (
        CheckConstraint("node_kind IN ('group', 'lesson')", name="ck_hierarchy_nodes_node_kind"),
    )

    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hierarchy_nodes.id", ondelete="CASCADE"), nullable=True, index=True
    )
    path: Mapped[str] = mapped_column(LtreeType, nullable=False)
    node_kind: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    lesson: Mapped["Lesson | None"] = relationship(
        back_populates="node", uselist=False, cascade="all, delete-orphan"
    )


class Lesson(TimestampMixin, Base):
    __tablename__ = "lessons"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hierarchy_nodes.id", ondelete="CASCADE"), primary_key=True
    )
    body_markdown: Mapped[str | None] = mapped_column(Text)

    node: Mapped["HierarchyNode"] = relationship(back_populates="lesson")
