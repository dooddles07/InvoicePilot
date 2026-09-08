from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import PrincipalDep, SessionDep, require
from app.core.security import Principal

router = APIRouter(prefix="/ai", tags=["AI"])


@router.post("/analyze", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_analyze(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("report:read"))],
) -> None:
    """Rank open invoices by expected recovery"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.post("/draft-reminder", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_draft_reminder(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("invoice:read"))],
) -> None:
    """Draft a reminder for review"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.post("/ask", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_ask(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("report:read"))],
) -> None:
    """Answer a question about the ledger"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )

