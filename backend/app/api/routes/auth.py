from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_login() -> None:
    """Exchange credentials for an access token"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.post("/refresh", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_refresh() -> None:
    """Rotate a refresh token"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.post("/logout", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_logout() -> None:
    """Revoke the current session"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.post("/password-reset", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_password_reset() -> None:
    """Request a reset link"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )

