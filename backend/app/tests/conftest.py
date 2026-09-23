import asyncpg
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.base import Base, get_db
from app.db.level_seed_data import LEVEL_NAMES
from app.main import app

TEST_DB_NAME = "jpeclearner_test"
_admin_url = settings.database_url.rsplit("/", 1)[0] + "/postgres"
TEST_DATABASE_URL = settings.database_url.rsplit("/", 1)[0] + f"/{TEST_DB_NAME}"


async def _ensure_test_database() -> None:
    admin_dsn = _admin_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(admin_dsn)
    try:
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", TEST_DB_NAME)
        if not exists:
            await conn.execute(f'CREATE DATABASE "{TEST_DB_NAME}"')
    finally:
        await conn.close()


@pytest_asyncio.fixture
async def client():
    await _ensure_test_database()

    engine = create_async_engine(TEST_DATABASE_URL, future=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS ltree"))
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(
            text("INSERT INTO level_definitions (level, name_en, name_fr, icon_key) "
                 "VALUES (:level, :name_en, :name_fr, :icon_key)"),
            [
                {"level": level, "name_en": name_en, "name_fr": name_fr, "icon_key": icon_key}
                for level, name_en, name_fr, icon_key in LEVEL_NAMES
            ],
        )

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    # Note: StaticFiles binds its serving directory at app import time, so
    # settings.image_storage_path can't be swapped per-test without also rebuilding
    # that mount. Tests that upload images are responsible for deleting what they
    # create (see test_cards.py) rather than relying on directory isolation.
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Exposed so tests that need to call a service function directly
        # (rather than through an HTTP route) can use the same test database.
        ac.session_factory = session_factory
        yield ac

    app.dependency_overrides.clear()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
