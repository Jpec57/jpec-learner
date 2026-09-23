from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import settings
from app.services.push import run_due_digest_job


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = AsyncIOScheduler()
    # Due timestamps are always rounded up to the hour (see srs.py), so a
    # batch of reviews can only ever become due on the hour -- checking a few
    # minutes after covers every user without needing finer granularity.
    scheduler.add_job(run_due_digest_job, "cron", minute=5)
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="JpecLearner API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

Path(settings.image_storage_path).mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.image_storage_path), name="media")


@app.get("/health")
async def health():
    return {"status": "ok"}
