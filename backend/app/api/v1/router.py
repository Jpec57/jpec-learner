from fastapi import APIRouter

from app.api.v1.routes import (
    assistant,
    auth,
    cards,
    categories,
    hierarchy,
    images,
    notifications,
    ocr,
    progression,
    reviews,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(categories.router)
api_router.include_router(hierarchy.router)
api_router.include_router(cards.router)
api_router.include_router(images.router)
api_router.include_router(reviews.router)
api_router.include_router(progression.router)
api_router.include_router(notifications.router)
api_router.include_router(assistant.router)
api_router.include_router(ocr.router)
