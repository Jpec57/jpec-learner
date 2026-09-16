import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class EnrollRequest(BaseModel):
    card_id: uuid.UUID | None = None
    lesson_node_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def exactly_one_target(self):
        if (self.card_id is None) == (self.lesson_node_id is None):
            raise ValueError("Provide exactly one of card_id or lesson_node_id")
        return self


class SubmitReviewRequest(BaseModel):
    rating: int = Field(ge=1, le=5)


class ReviewStateOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    card_id: uuid.UUID | None
    lesson_node_id: uuid.UUID | None
    repetitions: int
    ease_factor: float
    interval_days: int
    due_at: datetime
    last_reviewed_at: datetime | None
    last_rating: int | None
    current_level: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DueItemOut(BaseModel):
    review_state_id: uuid.UUID
    item_kind: Literal["card", "lesson"]
    card_id: uuid.UUID | None
    lesson_node_id: uuid.UUID | None
    front_text: str | None = None
    back_text: str | None = None
    title: str | None = None
    body_markdown: str | None = None
    due_at: datetime
    current_level: int


class DueCountOut(BaseModel):
    total_due: int


class LevelDefinitionOut(BaseModel):
    level: int
    name_en: str
    name_fr: str
    icon_key: str | None

    model_config = {"from_attributes": True}
