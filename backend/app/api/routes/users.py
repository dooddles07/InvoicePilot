from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import PrincipalDep, SessionDep, require
from app.core.security import Principal

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_me(session: SessionDep, principal: PrincipalDep) -> None:
    """The signed-in user"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.patch("/me", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def update_me(session: SessionDep, principal: PrincipalDep) -> None:
    """Update your own profile"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )

