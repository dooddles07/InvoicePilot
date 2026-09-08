from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import PrincipalDep, SessionDep, require
from app.core.security import Principal

router = APIRouter(prefix="/audit", tags=["Audit"])


@router.get("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_root(session: SessionDep, principal: PrincipalDep) -> None:
    """Audit log, filtered and paginated"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )

