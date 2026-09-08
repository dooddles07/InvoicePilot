from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import PrincipalDep, SessionDep, require
from app.core.security import Principal

router = APIRouter(prefix="/payments", tags=["Payments"])


@router.get("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_root(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("payment:read"))],
) -> None:
    """List payments"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.post("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_root(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("payment:write"))],
) -> None:
    """Record a payment against an invoice"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )

