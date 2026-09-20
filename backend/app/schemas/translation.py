from pydantic import BaseModel, Field

from app.schemas.category import LANGUAGE_CODE_PATTERN


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    source: str = Field(pattern=LANGUAGE_CODE_PATTERN)
    target: str = Field(pattern=LANGUAGE_CODE_PATTERN)


class TranslateResponse(BaseModel):
    translation: str
    # Values that are all valid answers (e.g. every definition of a Japanese
    # word), for a typed card's accepted answers.
    answers: list[str]
    # Other candidates (other senses, readings...), the translation included.
    # Suggestions only -- some may be wrong.
    alternatives: list[str]
    provider: str
