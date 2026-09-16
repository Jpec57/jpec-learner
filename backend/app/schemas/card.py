import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator


class CardCreate(BaseModel):
    category_id: uuid.UUID
    lesson_node_id: uuid.UUID | None = None
    front_text: str = Field(min_length=1)
    back_text: str = Field(min_length=1)
    is_public: bool = False


class CardUpdate(BaseModel):
    front_text: str | None = Field(default=None, min_length=1)
    back_text: str | None = Field(default=None, min_length=1)
    is_public: bool | None = None
    lesson_node_id: uuid.UUID | None = None


class ImageOut(BaseModel):
    id: uuid.UUID
    url: str
    content_type: str | None
    size_bytes: int | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _compute_url_from_orm(cls, data: Any) -> Any:
        """Accepts either a dict (url already set) or an Image ORM instance, from
        which `url` is derived from `file_path` (there's no `url` column)."""
        if isinstance(data, dict):
            return data
        return {
            "id": data.id,
            "url": f"/media/{data.file_path}",
            "content_type": data.content_type,
            "size_bytes": data.size_bytes,
            "created_at": data.created_at,
        }


class CardOut(BaseModel):
    id: uuid.UUID
    category_id: uuid.UUID
    lesson_node_id: uuid.UUID | None
    owner_id: uuid.UUID
    front_text: str
    back_text: str
    is_public: bool
    images: list[ImageOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
