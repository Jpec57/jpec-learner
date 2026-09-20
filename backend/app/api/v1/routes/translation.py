from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.translation import TranslateRequest, TranslateResponse
from app.services import translation as translation_service

router = APIRouter(prefix="/translate", tags=["translation"])


@router.post("", response_model=TranslateResponse)
async def translate_text(payload: TranslateRequest, current_user: User = Depends(get_current_user)):
    """Prefills a language deck's answer. Proxied through the backend because
    the free services don't allow browser (CORS) calls."""
    if payload.source.split("-")[0] == payload.target.split("-")[0]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Source and target languages must differ")
    try:
        result = await translation_service.translate(payload.text, payload.source, payload.target)
    except translation_service.TranslationUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    return TranslateResponse(
        translation=result.translation,
        answers=result.answers,
        alternatives=result.alternatives,
        provider=result.provider,
    )
