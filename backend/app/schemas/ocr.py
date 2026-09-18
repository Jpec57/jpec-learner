import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

OcrMode = Literal["general", "manga"]


class OcrScanOut(BaseModel):
    id: uuid.UUID
    mode: OcrMode
    text: str
    image_url: str
    card_id: uuid.UUID | None
    lesson_node_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class OcrScanLink(BaseModel):
    card_id: uuid.UUID | None = None
    lesson_node_id: uuid.UUID | None = None
