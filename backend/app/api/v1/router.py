from fastapi import APIRouter

from app.api.v1.routes import auth, categories, hierarchy

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(categories.router)
api_router.include_router(hierarchy.router)
