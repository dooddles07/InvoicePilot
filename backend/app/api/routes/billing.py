from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import PrincipalDep, SessionDep, require
from app.core.security import Principal

router = APIRouter(prefix="/billing", tags=["Billing"])


@router.get("/subscription", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_subscription(session: SessionDep, principal: PrincipalDep) -> None:
    """Current plan and usage"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.post("/subscription", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_subscription(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("billing:write"))],
) -> None:
    """Change plan"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.get("/invoices", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_invoices(session: SessionDep, principal: PrincipalDep) -> None:
    """InvoicePilot's own invoices"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )

