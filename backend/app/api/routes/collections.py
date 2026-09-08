from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import PrincipalDep, SessionDep, require
from app.core.security import Principal

router = APIRouter(prefix="/collections", tags=["Collections"])


@router.get("/pipeline", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_pipeline(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("invoice:read"))],
) -> None:
    """Invoices grouped by collection stage"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.get("/queue", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_queue(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("invoice:read"))],
) -> None:
    """Ranked by expected recovery"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.post("/reminders", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_reminders(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("invoice:write"))],
) -> None:
    """Send a reminder after human confirmation"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )

