import uuid

from pydantic import BaseModel


class ThemeProgressOut(BaseModel):
    node_id: uuid.UUID
    title: str
    total_items: int
    avg_level: float
    due_count: int


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
