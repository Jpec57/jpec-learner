from datetime import datetime

from sqlalchemy import DateTime, SmallInteger, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LevelDefinition(Base):
    __tablename__ = "level_definitions"

    level: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    name_en: Mapped[str] = mapped_column(String(40), nullable=False)
    name_fr: Mapped[str] = mapped_column(String(40), nullable=False)
    icon_key: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
