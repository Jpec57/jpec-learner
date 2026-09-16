from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import settings

app = FastAPI(title="JpecLearner API")

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
