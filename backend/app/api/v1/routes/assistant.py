from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.llm_credential import LLMCredential
from app.models.user import User
from app.schemas.assistant import ChatRequest, ChatResponse, LLMCredentialIn, LLMCredentialOut
from app.services.assistant.orchestrator import ResolvedCredential, run_chat
from app.services.assistant.providers import ProviderError

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.get("/credential", response_model=LLMCredentialOut)
async def get_credential(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    credential = await db.get(LLMCredential, current_user.id)
    if credential is None:
        return LLMCredentialOut(configured=False)
    return LLMCredentialOut(
        configured=True, provider=credential.provider, model=credential.model, updated_at=credential.updated_at
    )


@router.put("/credential", response_model=LLMCredentialOut, status_code=status.HTTP_200_OK)
async def set_credential(
    payload: LLMCredentialIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    credential = await db.get(LLMCredential, current_user.id)
    encrypted = encrypt_secret(payload.api_key)
    if credential is None:
        credential = LLMCredential(
            user_id=current_user.id, provider=payload.provider, encrypted_api_key=encrypted, model=payload.model
        )
        db.add(credential)
    else:
        credential.provider = payload.provider
        credential.encrypted_api_key = encrypted
        credential.model = payload.model

    await db.commit()
    await db.refresh(credential)
    return LLMCredentialOut(
        configured=True, provider=credential.provider, model=credential.model, updated_at=credential.updated_at
    )


@router.delete("/credential", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    credential = await db.get(LLMCredential, current_user.id)
    if credential is not None:
        await db.delete(credential)
        await db.commit()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    credential = await db.get(LLMCredential, current_user.id)
    if credential is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Configure an AI assistant API key first.")

    try:
        api_key = decrypt_secret(credential.encrypted_api_key)
    except ValueError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Stored API key could not be read.") from exc

    resolved = ResolvedCredential(provider=credential.provider, api_key=api_key, model=credential.model)

    try:
        message, tool_events = await run_chat(db, current_user, resolved, payload.messages, payload.category_id)
    except ProviderError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    return ChatResponse(message=message, tool_events=tool_events)
