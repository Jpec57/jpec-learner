from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    """`eager_defaults` makes server-computed columns (created_at/updated_at) come back
    via RETURNING after flush, so accessing them post-commit never needs an implicit
    lazy-load (which would crash outside an active async/greenlet context)."""

    __mapper_args__ = {"eager_defaults": True}


engine = create_async_engine(settings.database_url, echo=False, future=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
