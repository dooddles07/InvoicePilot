from __future__ import annotations

import hashlib
import secrets
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
#
# Automation permissions are kept even though the automations routes are
# deferred: the routes exist and are guarded today, and removing the grant
# would make them 403 for everyone rather than 501.
ROLE_PERMISSIONS: dict[Role, frozenset[str]] = {
    "owner": frozenset({"*"}),
    "admin": frozenset(
        {
            "invoice:read", "invoice:write",
            "customer:read", "customer:write",
            "payment:read", "payment:write",
            "automation:read", "automation:write",
            "report:read",
            "integration:read", "integration:write",
            "team:write", "workspace:write",
            "audit:read", "apikey:write",
        }
    ),
    "member": frozenset(
        {
            "invoice:read", "invoice:write",
            "customer:read", "customer:write",
            "payment:read", "payment:write",
            "automation:read", "report:read",
            "integration:read",
        }
    ),
    "viewer": frozenset(
        {
            "invoice:read",
            "customer:read",
            "payment:read",
            "report:read",
            "integration:read",
        }
    ),
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


def generate_refresh_token() -> str:
    """A refresh token is an opaque secret, not a JWT.

    Nothing needs to read anything out of it -- the row in ``refresh_tokens``
    holds the user, the expiry and the rotation chain -- so it carries no
    claims to forge and no signature to verify.
    """

    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    """SHA-256, not argon2.

    Deliberately different from ``hash_password``: this value is looked up on
    every refresh, and a 300ms KDF on the hot path is a self-inflicted denial
    of service. The token is 256 bits of urandom, so there is no dictionary to
    attack.
    """

    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def refresh_expiry() -> datetime:
    settings = get_settings()
    return datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_ttl_days)
