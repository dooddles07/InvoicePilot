from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import get_settings

Role = Literal["owner", "admin", "member", "viewer"]

# What each role may do. Kept as data rather than scattered ``if`` statements so
# the permission model can be read in one place -- and tested without a request.
ROLE_PERMISSIONS: dict[Role, frozenset[str]] = {
    "owner": frozenset({"*"}),
    "admin": frozenset(
        {
            "invoice:read", "invoice:write",
            "customer:read", "customer:write",
            "payment:read", "payment:write",
            "automation:read", "automation:write",
            "report:read", "integration:write",
            "team:write", "apikey:write",
        }
    ),
    "member": frozenset(
        {
            "invoice:read", "invoice:write",
            "customer:read", "customer:write",
            "payment:read", "payment:write",
            "automation:read", "report:read",
        }
    ),
    "viewer": frozenset({"invoice:read", "customer:read", "payment:read", "report:read"}),
}

_hasher = PasswordHasher()


def hash_password(plaintext: str) -> str:
    return _hasher.hash(plaintext)


def verify_password(plaintext: str, hashed: str) -> bool:
    try:
        return _hasher.verify(hashed, plaintext)
    except VerifyMismatchError:
        return False


@dataclass(frozen=True, slots=True)
class Principal:
    """Who is making the request, and in which workspace.

    ``workspace_id`` is part of the identity rather than a query parameter.
    Every repository takes it from here, so a caller cannot widen their own
    scope by editing a URL.
    """

    user_id: UUID
    workspace_id: UUID
    role: Role

    def can(self, permission: str) -> bool:
        grants = ROLE_PERMISSIONS[self.role]
        return "*" in grants or permission in grants


def issue_access_token(principal: Principal) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(principal.user_id),
        "ws": str(principal.workspace_id),
        "role": principal.role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_ttl_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_access_token(token: str) -> Principal:
    settings = get_settings()
    claims = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    return Principal(
        user_id=UUID(claims["sub"]),
        workspace_id=UUID(claims["ws"]),
        role=claims["role"],
    )
