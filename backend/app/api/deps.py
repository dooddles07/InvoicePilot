from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Iterator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.core.security import Principal, decode_access_token


@lru_cache
def get_engine() -> Engine:
    """Built on first use, not at import.

    Creating the engine at module scope means importing any router loads the
    database driver and parses a connection URL — so the test suite, a CLI
    command, or `python -c "from app.main import app"` all fail for reasons
    that have nothing to do with what they were doing.
    """
    return create_engine(str(get_settings().database_url), pool_pre_ping=True)


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


_bearer = HTTPBearer(auto_error=True)


def get_session() -> Iterator[Session]:
    session = get_sessionmaker()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_principal(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> Principal:
    try:
        return decode_access_token(credentials.credentials)
    except Exception as exc:  # noqa: BLE001 - any decode failure is the same answer
        # Deliberately uniform: distinguishing "expired" from "malformed" from
        # "wrong signature" tells an attacker which of their guesses was closer.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def require(permission: str):
    """Dependency factory: guard a route with a single named permission."""

    def _guard(principal: Annotated[Principal, Depends(get_principal)]) -> Principal:
        if not principal.can(permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires {permission}",
            )
        return principal

    return _guard


SessionDep = Annotated[Session, Depends(get_session)]
PrincipalDep = Annotated[Principal, Depends(get_principal)]
