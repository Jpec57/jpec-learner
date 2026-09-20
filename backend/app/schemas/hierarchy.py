import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.card import ImageOut

NodeKind = Literal["group", "lesson"]


class HierarchyNodeCreate(BaseModel):
    model_config = {"str_strip_whitespace": True}

    category_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    node_kind: NodeKind
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    order_index: int | None = None
    is_public: bool = False
    body_markdown: str | None = None
    exclude_from_review: bool = False

    @model_validator(mode="after")
    def body_only_for_lessons(self):
        if self.node_kind == "group" and self.body_markdown is not None:
            raise ValueError("body_markdown is only valid for node_kind='lesson'")
        if self.node_kind == "group" and self.exclude_from_review:
            raise ValueError("exclude_from_review is only valid for node_kind='lesson'")
        return self


class HierarchyNodeUpdate(BaseModel):
    model_config = {"str_strip_whitespace": True}

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    is_public: bool | None = None
    body_markdown: str | None = None
    exclude_from_review: bool | None = None


class HierarchyNodeFlatOut(BaseModel):
    """Lightweight shape for populating a "move this card/node to..." picker
    across the whole category, without the per-node children/images payload
    HierarchyNodeOut carries."""

    id: uuid.UUID
    parent_id: uuid.UUID | None
    node_kind: NodeKind
    title: str

    model_config = {"from_attributes": True}


class HierarchyNodeMove(BaseModel):
    new_parent_id: uuid.UUID | None = None
    new_order_index: int | None = None


class AncestorOut(BaseModel):
    id: uuid.UUID
    title: str


class ChildCountsOut(BaseModel):
    groups: int = 0
    lessons: int = 0
    cards: int = 0


class HierarchyNodeOut(BaseModel):
    id: uuid.UUID
    category_id: uuid.UUID
    parent_id: uuid.UUID | None
    node_kind: NodeKind
    title: str
    description: str | None
    order_index: int
    owner_id: uuid.UUID
    is_public: bool
    has_children: bool = False
    child_counts: ChildCountsOut = ChildCountsOut()
    ancestors: list[AncestorOut] = []
    body_markdown: str | None = None
    exclude_from_review: bool = False
    images: list[ImageOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class HierarchyNodePageOut(BaseModel):
    items: list[HierarchyNodeOut]
    total: int
