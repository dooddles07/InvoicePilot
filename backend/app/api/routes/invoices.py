from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import PrincipalDep, SessionDep, require
from app.core.security import Principal

router = APIRouter(prefix="/invoices", tags=["Invoices"])


@router.get("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_root(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("invoice:read"))],
) -> None:
    """List invoices, filtered and paginated"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.post("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_root(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("invoice:write"))],
) -> None:
    """Create an invoice"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.get("/{invoice_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_root_2(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("invoice:read"))],
) -> None:
    """One invoice with line items"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.patch("/{invoice_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def update_root(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("invoice:write"))],
) -> None:
    """Update an invoice"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.post("/{invoice_id}/send", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_send(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("invoice:write"))],
) -> None:
    """Issue the invoice to the customer"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.get("/{invoice_id}/events", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_events(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("invoice:read"))],
) -> None:
    """Activity log"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )

