from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import PrincipalDep, SessionDep, require
from app.core.security import Principal

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/aging", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_aging(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("report:read"))],
) -> None:
    """Accounts receivable aging"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.get("/cash-flow", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_cash_flow(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("report:read"))],
) -> None:
    """Expected against collected"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.get("/collection-rate", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_collection_rate(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("report:read"))],
) -> None:
    """Share of due value settled"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.get("/customer-risk", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_customer_risk(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("report:read"))],
) -> None:
    """Risk grade per account"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.get("/days-to-payment", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_days_to_payment(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("report:read"))],
) -> None:
    """Mean and median days to settlement"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )

