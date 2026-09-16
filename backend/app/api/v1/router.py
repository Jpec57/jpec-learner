from fastapi import APIRouter

from app.api.v1.routes import auth, cards, categories, hierarchy, images, progression, reviews

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(categories.router)
api_router.include_router(hierarchy.router)
api_router.include_router(cards.router)
api_router.include_router(images.router)
api_router.include_router(reviews.router)
api_router.include_router(progression.router)
