from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import PrincipalDep, SessionDep, require
from app.core.security import Principal

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


@router.get("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_root(session: SessionDep, principal: PrincipalDep) -> None:
    """Workspaces you belong to"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.post("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_root(session: SessionDep, principal: PrincipalDep) -> None:
    """Create a workspace"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.get("/{workspace_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_root_2(session: SessionDep, principal: PrincipalDep) -> None:
    """One workspace"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.patch("/{workspace_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def update_root(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("team:write"))],
) -> None:
    """Update workspace settings"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.get("/{workspace_id}/members", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_members(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("team:write"))],
) -> None:
    """Members and roles"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.post("/{workspace_id}/members", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_members(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("team:write"))],
) -> None:
    """Invite a member"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )

