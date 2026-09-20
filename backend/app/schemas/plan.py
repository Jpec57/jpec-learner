import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

SectionStatus = Literal["no_content", "not_started", "weak", "in_progress", "solid"]


class PlanUpdate(BaseModel):
    """Partial update: only the fields actually sent are changed, so the goal
    and the plan can be saved independently (an explicit null clears one)."""

    goal: str | None = Field(default=None, max_length=2000)
    plan_markdown: str | None = Field(default=None, max_length=50_000)


class PlanOut(BaseModel):
    goal: str | None
    plan_markdown: str | None


class ChecklistItemOut(BaseModel):
    text: str
    done: bool


class PlanSectionOut(BaseModel):
    level: int
    title: str
    # The hierarchy group/lesson this heading was matched to by title, if any.
    node_id: uuid.UUID | None
    status: SectionStatus
    total_items: int
    reviewed_items: int
    avg_level: float
    due_count: int
    # Share of the last 30 days' reviews rated Again/Hard; null without enough reviews.
    lapse_rate: float | None
    weakness_score: float
    last_reviewed_at: datetime | None
    checklist: list[ChecklistItemOut]


class WeakCardOut(BaseModel):
    card_id: uuid.UUID
    front_text: str
    lesson_node_id: uuid.UUID | None
    current_level: int
    ease_factor: float
    lapses: int


class PlanProgressOut(BaseModel):
    goal: str | None
    sections: list[PlanSectionOut]
    weakest_cards: list[WeakCardOut]
    total_due: int
