from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import PrincipalDep, SessionDep, require
from app.core.security import Principal

router = APIRouter(prefix="/customers", tags=["Customers"])


@router.get("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_root(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("customer:read"))],
) -> None:
    """List customers with derived statistics"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.post("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_root(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("customer:write"))],
) -> None:
    """Create a customer"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.get("/{customer_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_root_2(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("customer:read"))],
) -> None:
    """One customer"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.patch("/{customer_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def update_root(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("customer:write"))],
) -> None:
    """Update a customer"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.get("/{customer_id}/behaviour", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_behaviour(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("customer:read"))],
) -> None:
    """Days beyond terms, by month"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )

