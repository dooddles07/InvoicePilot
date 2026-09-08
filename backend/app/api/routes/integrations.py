from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import PrincipalDep, SessionDep, require
from app.core.security import Principal

router = APIRouter(prefix="/integrations", tags=["Integrations"])


@router.get("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_root(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("integration:write"))],
) -> None:
    """Connected and available integrations"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.post("/{provider}/connect", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_connect(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("integration:write"))],
) -> None:
    """Begin an OAuth connection"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.delete("/{provider}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def remove_root(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("integration:write"))],
) -> None:
    """Disconnect a provider"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )


@router.post("/{provider}/sync", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_sync(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("integration:write"))],
) -> None:
    """Trigger a sync"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: the service layer for this route is not wired yet.",
    )

