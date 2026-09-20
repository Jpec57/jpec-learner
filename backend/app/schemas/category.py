import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

HEX_COLOR_PATTERN = r"^#[0-9a-fA-F]{6}$"
LANGUAGE_CODE_PATTERN = r"^[a-z]{2,3}(-[A-Za-z]{2,4})?$"

DeckType = Literal["general", "language", "scientific"]


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=80)
    icon: str | None = Field(default=None, max_length=80)
    is_public: bool = False
    theme_color: str | None = Field(default=None, pattern=HEX_COLOR_PATTERN)
    deck_type: DeckType = "general"


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    icon: str | None = Field(default=None, max_length=80)
    is_public: bool | None = None
    theme_color: str | None = Field(default=None, pattern=HEX_COLOR_PATTERN)
    deck_type: DeckType | None = None
    source_language: str | None = Field(default=None, pattern=LANGUAGE_CODE_PATTERN)
    target_language: str | None = Field(default=None, pattern=LANGUAGE_CODE_PATTERN)


class CategoryOut(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    icon: str | None
    owner_id: uuid.UUID
    is_public: bool
    theme_color: str | None
    deck_type: DeckType
    source_language: str | None
    target_language: str | None
    due_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
