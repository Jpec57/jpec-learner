import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

NodeKind = Literal["group", "lesson"]


class HierarchyNodeCreate(BaseModel):
    category_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    node_kind: NodeKind
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    order_index: int | None = None
    is_public: bool = False
    body_markdown: str | None = None

    @model_validator(mode="after")
    def body_only_for_lessons(self):
        if self.node_kind == "group" and self.body_markdown is not None:
            raise ValueError("body_markdown is only valid for node_kind='lesson'")
        return self


class HierarchyNodeUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    is_public: bool | None = None
    body_markdown: str | None = None


class HierarchyNodeMove(BaseModel):
    new_parent_id: uuid.UUID | None = None
    new_order_index: int | None = None


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
    body_markdown: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
