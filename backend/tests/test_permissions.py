"""The permission matrix from the spec, asserted row by row.

A matrix that drifts silently is the failure mode worth a test: a route
guarded by a permission nobody was ever granted is a 403 for everyone, and a
permission granted to the wrong role is a quiet privilege escalation. Both
look like working code.
"""

from __future__ import annotations

import os
from uuid import uuid4

os.environ.setdefault("SECRET_KEY", "test-only-key-that-is-long-enough-for-hs256")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test"
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

import pytest  # noqa: E402

from app.core.security import Principal, Role  # noqa: E402

# Rows are permissions, columns are roles. Copied from spec section 5.
MATRIX: dict[str, set[Role]] = {
    "invoice:read": {"owner", "admin", "member", "viewer"},
    "customer:read": {"owner", "admin", "member", "viewer"},
    "payment:read": {"owner", "admin", "member", "viewer"},
    "report:read": {"owner", "admin", "member", "viewer"},
    "integration:read": {"owner", "admin", "member", "viewer"},
    "automation:read": {"owner", "admin", "member"},
    "automation:write": {"owner", "admin"},
    "invoice:write": {"owner", "admin", "member"},
    "customer:write": {"owner", "admin", "member"},
    "payment:write": {"owner", "admin", "member"},
    "integration:write": {"owner", "admin"},
    "team:write": {"owner", "admin"},
    "workspace:write": {"owner", "admin"},
    "audit:read": {"owner", "admin"},
    "apikey:write": {"owner", "admin"},
    "billing:write": {"owner"},
}

ROLES: tuple[Role, ...] = ("owner", "admin", "member", "viewer")


def _principal(role: Role) -> Principal:
    return Principal(user_id=uuid4(), workspace_id=uuid4(), role=role)


@pytest.mark.parametrize("permission", sorted(MATRIX))
@pytest.mark.parametrize("role", ROLES)
def test_permission_matrix(permission: str, role: Role) -> None:
    expected = role in MATRIX[permission]
    assert _principal(role).can(permission) is expected


def test_every_permission_a_route_guards_is_in_the_matrix() -> None:
    # Catches the reverse mistake: a route guarded by a string that appears in
    # no role's grant list, which is a permanent 403 nobody can grant away.
    import pathlib
    import re

    routes = pathlib.Path("app/api/routes")
    guarded = set()
    for path in routes.glob("*.py"):
        guarded.update(re.findall(r'require\("([^"]+)"\)', path.read_text()))

    unknown = guarded - set(MATRIX)
    assert unknown == set(), f"routes guard permissions nobody grants: {unknown}"
