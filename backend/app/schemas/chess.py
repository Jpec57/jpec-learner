from pydantic import BaseModel, Field

_ID = Field(min_length=1, max_length=64)


class LineResultIn(BaseModel):
    course_id: str = _ID
    line_id: str = _ID
    flawless: bool


class LineProgressIn(BaseModel):
    course_id: str = _ID
    line_id: str = _ID
    completed: int = Field(ge=0)
    flawless: int = Field(ge=0)


class LineProgressImport(BaseModel):
    """Progress saved in the browser before it was stored on the account."""

    lines: list[LineProgressIn] = Field(max_length=500)


class LineProgressOut(BaseModel):
    course_id: str
    line_id: str
    completed: int
    flawless: int

    model_config = {"from_attributes": True}
