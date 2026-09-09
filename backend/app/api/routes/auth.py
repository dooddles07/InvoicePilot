from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status

from app.api.deps import PrincipalDep, SessionDep
from app.schemas.auth import (
    AuthResult,
    LoginRequest,
    RefreshRequest,
    SignupRequest,
    SwitchWorkspaceRequest,
)
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Routes are thin on purpose: validate, delegate, shape. Cookies are set by the
# Next.js Server Action that called this, because only it has a browser to set
# them on -- this service is private and never speaks to one.


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def create_signup(request: SignupRequest, session: SessionDep) -> AuthResult:
    """Create a user, their workspace, and a first session"""
    return AuthService(session).signup(request)


@router.post("/login")
def create_login(request: LoginRequest, session: SessionDep) -> AuthResult:
    """Exchange credentials for a token pair"""
    return AuthService(session).login(request)


@router.post("/refresh")
def create_refresh(request: RefreshRequest, session: SessionDep) -> AuthResult:
    """Rotate a refresh token"""
    return AuthService(session).refresh(request.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def create_logout(request: RefreshRequest, session: SessionDep) -> Response:
    """Revoke the current session"""
    AuthService(session).logout(request.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/switch-workspace")
def create_workspace_switch(
    request: SwitchWorkspaceRequest,
    session: SessionDep,
    principal: PrincipalDep,
) -> AuthResult:
    """Issue a token pair scoped to another workspace the caller belongs to"""
    return AuthService(session).switch_workspace(principal, request.workspace_id)


@router.post("/password-reset", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_password_reset() -> None:
    """Request a reset link"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: password reset needs the outbox from plan 4.",
    )
