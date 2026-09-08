"""The checks that matter for a skeleton: tenancy and permissions.

Everything else here returns 501, so there is nothing to assert about it. These
two are different — they are the guarantees the rest of the service is built on
top of, and they are wrong silently rather than loudly.
"""

from __future__ import annotations

import os
from uuid import uuid4

os.environ.setdefault("SECRET_KEY", "test-only-key-that-is-long-enough-for-hs256")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test"
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from app.core.security import (  # noqa: E402
    Principal,
    decode_access_token,
    hash_password,
    issue_access_token,
    verify_password,
)


def test_password_round_trip() -> None:
    hashed = hash_password("correct horse battery staple")
    assert hashed != "correct horse battery staple"
    assert verify_password("correct horse battery staple", hashed)
    assert not verify_password("wrong horse battery staple", hashed)


def test_token_carries_workspace_scope() -> None:
    principal = Principal(user_id=uuid4(), workspace_id=uuid4(), role="member")
    decoded = decode_access_token(issue_access_token(principal))

    # The workspace travels inside the signed token, so a caller cannot widen
    # their own scope by editing a request.
    assert decoded.workspace_id == principal.workspace_id
    assert decoded.user_id == principal.user_id
    assert decoded.role == "member"


def test_viewer_cannot_write() -> None:
    viewer = Principal(user_id=uuid4(), workspace_id=uuid4(), role="viewer")
    assert viewer.can("invoice:read")
    assert not viewer.can("invoice:write")
    assert not viewer.can("team:write")


def test_member_can_collect_but_not_configure() -> None:
    member = Principal(user_id=uuid4(), workspace_id=uuid4(), role="member")
    assert member.can("invoice:write")
    assert member.can("payment:write")
    # Working the queue is not the same authority as changing how money is
    # chased, or who else can chase it.
    assert not member.can("automation:write")
    assert not member.can("team:write")


def test_owner_has_every_permission() -> None:
    owner = Principal(user_id=uuid4(), workspace_id=uuid4(), role="owner")
    for permission in ("invoice:write", "team:write", "apikey:write", "anything:at:all"):
        assert owner.can(permission)
