import uuid
from datetime import datetime

from pydantic import BaseModel, Field

HEX_COLOR_PATTERN = r"^#[0-9a-fA-F]{6}$"


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=80)
    icon: str | None = Field(default=None, max_length=80)
    is_public: bool = False
    theme_color: str | None = Field(default=None, pattern=HEX_COLOR_PATTERN)


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    icon: str | None = Field(default=None, max_length=80)
    is_public: bool | None = None
    theme_color: str | None = Field(default=None, pattern=HEX_COLOR_PATTERN)


class CategoryOut(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    icon: str | None
    owner_id: uuid.UUID
    is_public: bool
    theme_color: str | None
    due_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
