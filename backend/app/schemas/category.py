import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=80)
    icon: str | None = Field(default=None, max_length=80)
    is_public: bool = False


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    icon: str | None = Field(default=None, max_length=80)
    is_public: bool | None = None


class CategoryOut(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    icon: str | None
    owner_id: uuid.UUID
    is_public: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
