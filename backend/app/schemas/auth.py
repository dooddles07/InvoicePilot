"""Wire shapes for the auth endpoints.

These mirror the TypeScript in ``src/types/index.ts`` field for field,
snake_case included, so the DAL's Zod schema is a transcription rather than a
translation.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    # Length is the only rule that reliably predicts strength; matches the Zod
    # schema in auth-form.tsx so the two cannot disagree about what is valid.
    password: str = Field(min_length=10, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class RefreshRequest(BaseModel):
    refresh_token: str


class SwitchWorkspaceRequest(BaseModel):
    workspace_id: UUID


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    # Seconds, so the cookie's max-age can be set without the caller knowing
    # the configured TTL.
    expires_in: int


class SessionUser(BaseModel):
    id: UUID
    email: str
    full_name: str
    avatar_url: str | None
    workspace_id: UUID
    workspace_name: str
    role: str


class AuthResult(BaseModel):
    tokens: TokenPair
    user: SessionUser
