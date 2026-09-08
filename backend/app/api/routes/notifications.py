from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import PrincipalDep, SessionDep, require
from app.core.security import Principal

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_root(session: SessionDep, principal: PrincipalDep) -> None:
    """Unread notifications"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.post("/read", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_read(session: SessionDep, principal: PrincipalDep) -> None:
    """Mark notifications read"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.get("/preferences", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_preferences(session: SessionDep, principal: PrincipalDep) -> None:
    """Per-event channel preferences"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.put("/preferences", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def replace_preferences(session: SessionDep, principal: PrincipalDep) -> None:
    """Update preferences"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )

