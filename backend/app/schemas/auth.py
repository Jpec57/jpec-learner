import uuid

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, max_length=120)
    locale: str = Field(default="fr", pattern="^(fr|en)$")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UpdateMeRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    locale: str | None = Field(default=None, pattern="^(fr|en)$")


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    display_name: str | None
    locale: str

    model_config = {"from_attributes": True}
