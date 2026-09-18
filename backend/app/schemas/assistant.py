from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

LLMProviderName = Literal["gemini", "claude", "chatgpt"]

ChatRole = Literal["user", "assistant"]


class LLMCredentialIn(BaseModel):
    provider: LLMProviderName
    api_key: str = Field(min_length=1)
    model: str | None = Field(default=None, max_length=80)


class LLMCredentialOut(BaseModel):
    configured: bool
    provider: LLMProviderName | None = None
    model: str | None = None
    updated_at: datetime | None = None


class ChatMessageIn(BaseModel):
    role: ChatRole
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    messages: list[ChatMessageIn] = Field(min_length=1)
    category_id: str | None = None


class ToolEventOut(BaseModel):
    tool: str
    args: dict[str, Any]
    ok: bool
    summary: str


class ChatResponse(BaseModel):
    message: ChatMessageIn
    tool_events: list[ToolEventOut]
