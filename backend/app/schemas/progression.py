import uuid
from datetime import datetime

from pydantic import BaseModel


class ThemeProgressOut(BaseModel):
    node_id: uuid.UUID
    title: str
    total_items: int
    avg_level: float
    due_count: int


class CardProgressOut(BaseModel):
    card_id: uuid.UUID
    front_text: str
    back_text: str
    # All None when the user isn't enrolled in the card.
    current_level: int | None = None
    due_at: datetime | None = None
    repetitions: int | None = None
    last_reviewed_at: datetime | None = None


class LevelCountOut(BaseModel):
    level: int
    count: int


class ProgressionOut(BaseModel):
    category_id: uuid.UUID
    streak_days: int
    total_items: int
    total_due: int
    themes: list[ThemeProgressOut]
    level_distribution: list[LevelCountOut]
