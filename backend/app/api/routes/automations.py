from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import PrincipalDep, SessionDep, require
from app.core.security import Principal

router = APIRouter(prefix="/automations", tags=["Automations"])


@router.get("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_root(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("automation:read"))],
) -> None:
    """List automations"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.post("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_root(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("automation:write"))],
) -> None:
    """Create an automation"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.get("/{automation_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_root_2(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("automation:read"))],
) -> None:
    """One automation with its steps"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.patch("/{automation_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def update_root(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("automation:write"))],
) -> None:
    """Update or activate an automation"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.get("/{automation_id}/runs", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_runs(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("automation:read"))],
) -> None:
    """Run history"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )

