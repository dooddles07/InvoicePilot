# Authentication and Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake `setTimeout` login with a real session: FastAPI issues and rotates tokens, Next holds them in httpOnly cookies, and every screen behind `/dashboard` is reachable only with a valid one.

**Architecture:** FastAPI owns identity and is the only thing that verifies a token — Next never learns `SECRET_KEY`. `POST /api/auth/*` returns a token pair in the JSON body; the Next Server Action that called it writes the two cookies. `proxy.ts` does the optimistic cookie check and owns refresh, because Next forbids cookie writes during a Server Component render. The Data Access Layer in `src/lib/api/` only ever reads cookies and forwards the access token as a bearer.

**Tech Stack:** FastAPI 0.121, SQLAlchemy 2.0.46, PyJWT, argon2-cffi, pytest 8.4.2, Next.js 16.3.4 (App Router), React 19.2.8, Zod 4.

**Spec:** `docs/superpowers/specs/2026-09-08-invoicepilot-backend-integration-design.md`

**Depends on:** `docs/superpowers/plans/2026-09-08-schema-views-and-seeder.md` — the `users`, `refresh_tokens` and `workspace_members` tables, and the `engine`/`db`/`workspace_id` pytest fixtures, all come from that plan. Do not start this one until `alembic upgrade head` succeeds there.

## Global Constraints

- **The browser never calls FastAPI.** Reads go through `src/lib/api/`, writes through `src/lib/actions/`. If a component contains a `fetch()` to `localhost:8000`, the change is wrong.
- **Both cookies are `httpOnly`, `secure`, `sameSite=lax`, `path=/`.** `ip_at` (access JWT) lives 30 minutes, `ip_rt` (opaque refresh) 14 days. No browser script may read either.
- **Refresh tokens are stored hashed** (`sha256`, hex, 64 chars) and are single-use. Presenting a revoked one revokes its entire chain.
- **A failed login returns the same `401` and the same body whether the email exists or not.** Any branch that answers faster or differently for a known email is an account-enumeration oracle.
- **`workspace_id` lives in the access token, never in a request body or URL.** Switching workspace means issuing a new token pair.
- **Multi-tenancy is enforced only in `WorkspaceRepository._query()`** (`backend/app/repositories/base.py`). Auth code may read `principal.workspace_id`; it may not re-implement the filter as the primary defence.
- **Cross-tenant reads answer `404`, never `403`.** A `403` confirms the record exists in someone else's workspace.
- **Services own the transaction; repositories never commit.**
- **Run backend commands from `backend/`** with the virtualenv active, and `DATABASE_URL` pointing at a database whose name contains `test` before running pytest.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/core/security.py` | *Modified* — corrected permission table, refresh-token hashing and generation |
| `backend/app/core/errors.py` | Domain exceptions and the single FastAPI exception handler |
| `backend/app/schemas/auth.py` | Request and response models for every auth endpoint |
| `backend/app/services/auth.py` | `AuthService` — signup, login, refresh rotation, logout, workspace switch |
| `backend/app/api/routes/auth.py` | *Modified* — the five auth endpoints, thin |
| `backend/app/api/routes/*.py` | *Modified* — corrected permission guards |
| `backend/app/main.py` | *Modified* — CORS deleted, exception handler registered |
| `backend/tests/test_permissions.py` | The permission matrix, row by row |
| `backend/tests/test_auth_service.py` | Signup, login, rotation, chain revocation, workspace switch |
| `backend/tests/test_auth_routes.py` | Status codes and response shapes through the ASGI app |
| `src/lib/api/client.ts` | The one place a URL to FastAPI is constructed; bearer, Zod parse, error mapping |
| `src/lib/api/session.ts` | `getSession()` — the DAL's read of who is signed in |
| `src/lib/actions/auth.ts` | `login`, `signup`, `logout`, `switchWorkspace` Server Actions; cookie writes |
| `src/lib/auth/cookies.ts` | Cookie names, options, and the shared `setSessionCookies` helper |
| `src/proxy.ts` | Optimistic cookie check and refresh rotation |
| `src/components/auth/auth-form.tsx` | *Modified* — Server Action instead of `setTimeout` |
| `src/components/shell/workspace-switcher.tsx` | *Modified* — calls `switchWorkspace` |

---

## Task 1: The corrected permission matrix

**Files:**
- Modify: `backend/app/core/security.py:19-39` (`ROLE_PERMISSIONS`)
- Modify: `backend/app/api/routes/billing.py`, `integrations.py`, `audit.py`, `workspaces.py`
- Test: `backend/tests/test_permissions.py`

**Interfaces:**
- Consumes: `Principal`, `ROLE_PERMISSIONS` from `app.core.security`
- Produces: `ROLE_PERMISSIONS` covering every permission string the routes reference. No new functions.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_permissions.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_permissions.py -v`
Expected: FAIL — `integration:read`, `workspace:write`, `audit:read` and `billing:write` are in the matrix but in no role's grant list, and `test_every_permission_a_route_guards_is_in_the_matrix` reports `automation:read`/`automation:write` as unknown

- [ ] **Step 3: Correct the table**

In `backend/app/core/security.py`, replace `ROLE_PERMISSIONS` with:

```python
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
```

Then add the two automation permissions to the test matrix so the reverse check passes:

```python
    "automation:read": {"owner", "admin", "member"},
    "automation:write": {"owner", "admin"},
```

- [ ] **Step 4: Re-guard the routes**

In `backend/app/api/routes/billing.py`, the two write routes take `require("billing:write")` instead of `require("workspace:write")`, and the reads stay `PrincipalDep`:

```python
@router.post("/subscription", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_subscription(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("billing:write"))],
) -> None:
```

In `backend/app/api/routes/integrations.py`, every `GET` takes `require("integration:read")`; `POST`, `PATCH` and `DELETE` keep `require("integration:write")`.

In `backend/app/api/routes/audit.py`, `get_root` takes `require("audit:read")` in place of `PrincipalDep`:

```python
def get_root(
    session: SessionDep,
    principal: Annotated[Principal, Depends(require("audit:read"))],
) -> None:
```

In `backend/app/api/routes/workspaces.py`, the `PATCH` route takes `require("workspace:write")`; the member routes keep `require("team:write")`.

`users.py` `/me` and `notifications.py` stay on `PrincipalDep` — any authenticated principal, scoped to themselves.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_permissions.py tests/test_security.py -v`
Expected: PASS, 66 permission assertions plus the existing security tests

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/security.py backend/app/api/routes backend/tests/test_permissions.py
git commit -m "fix: grant the permissions the routes already guard and test the matrix"
```

---

## Task 2: Domain errors and one exception handler

**Files:**
- Create: `backend/app/core/errors.py`
- Modify: `backend/app/main.py:46-52` (delete CORS), and the imports and app construction
- Test: `backend/tests/test_errors.py`

**Interfaces:**
- Consumes: nothing
- Produces: `DomainError` and its subclasses `NotFound`, `PermissionDenied`, `AuthenticationFailed`, `ValidationFailed`, `Conflict` — each with a `status_code` class attribute and a `detail` argument — plus `install_error_handlers(app: FastAPI) -> None`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_errors.py`:

```python
"""The mapping from domain error to HTTP status, and what leaks in the body."""

from __future__ import annotations

import os

os.environ.setdefault("SECRET_KEY", "test-only-key-that-is-long-enough-for-hs256")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test"
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.errors import (  # noqa: E402
    AuthenticationFailed,
    Conflict,
    NotFound,
    PermissionDenied,
    ValidationFailed,
    install_error_handlers,
)


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/boom/{kind}")
    def boom(kind: str) -> None:
        raise {
            "not-found": NotFound("Invoice not found"),
            "denied": PermissionDenied("Requires invoice:write"),
            "auth": AuthenticationFailed(),
            "invalid": ValidationFailed("Amount must be positive"),
            "conflict": Conflict("That email is taken"),
            "unhandled": RuntimeError("connection string: postgres://u:p@host/db"),
        }[kind]

    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize(
    ("kind", "expected"),
    [
        ("not-found", 404),
        ("denied", 403),
        ("auth", 401),
        ("invalid", 422),
        ("conflict", 409),
        ("unhandled", 500),
    ],
)
def test_domain_errors_map_to_status_codes(client: TestClient, kind, expected) -> None:
    assert client.get(f"/boom/{kind}").status_code == expected


def test_an_unhandled_error_never_leaks_internals(client: TestClient) -> None:
    # The exception message here contains a password. A generic body is the
    # difference between an incident and a breach.
    body = client.get("/boom/unhandled").json()
    assert "postgres://" not in str(body)
    assert body["detail"] == "Internal server error"


def test_authentication_failure_is_always_the_same_words(client: TestClient) -> None:
    # Uniform by construction: the caller cannot pass a detail that would say
    # which half of the credentials was wrong.
    assert client.get("/boom/auth").json()["detail"] == "Invalid credentials"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_errors.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.core.errors'`

- [ ] **Step 3: Write the errors module**

Create `backend/app/core/errors.py`:

```python
"""Domain errors and the single place they become HTTP.

Services raise these; routes never catch them. That keeps a route to
"validate, delegate, shape" and keeps the status-code policy -- especially
"cross-tenant is 404, not 403" -- in one readable place.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("invoicepilot.errors")


class DomainError(Exception):
    status_code: int = 400
    default_detail: str = "Request failed"

    def __init__(self, detail: str | None = None) -> None:
        self.detail = detail or self.default_detail
        super().__init__(self.detail)


class NotFound(DomainError):
    """Also raised for a record in another workspace.

    Answering 403 there would confirm the record exists, which turns a list of
    guessed ids into a census of another tenant's data.
    """

    status_code = 404
    default_detail = "Not found"


class PermissionDenied(DomainError):
    status_code = 403
    default_detail = "Not permitted"


class AuthenticationFailed(DomainError):
    """Deliberately detail-free: the message is fixed, whatever the cause."""

    status_code = 401
    default_detail = "Invalid credentials"

    def __init__(self, detail: str | None = None) -> None:  # noqa: ARG002
        super().__init__(self.default_detail)


class ValidationFailed(DomainError):
    status_code = 422
    default_detail = "Invalid request"


class Conflict(DomainError):
    status_code = 409
    default_detail = "Already exists"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain(request: Request, exc: DomainError) -> JSONResponse:
        headers = (
            {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
        )
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail}, headers=headers
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # Logged with an id so support can find this exact request; the client
        # gets the id and nothing else. Stack traces have connection strings in
        # them.
        request_id = uuid.uuid4().hex
        logger.exception(
            "unhandled error request_id=%s path=%s", request_id, request.url.path
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "request_id": request_id},
        )
```

- [ ] **Step 4: Register the handlers and delete CORS**

In `backend/app/main.py`, delete the `from fastapi.middleware.cors import CORSMiddleware` import and the whole `app.add_middleware(CORSMiddleware, ...)` block, and add after the `app = FastAPI(...)` call:

```python
# No CORS middleware: the browser never calls this service directly. Every
# request arrives from the Next.js server with a bearer token. Adding CORS back
# would mean re-opening a public browser-facing surface that has no CSRF story.
install_error_handlers(app)
```

with `from app.core.errors import install_error_handlers` added to the imports.

Then delete `cors_origins` from `backend/app/core/config.py`:

```python
    # (cors_origins removed: decision 7 -- FastAPI is private.)
```

and remove any `CORS_ORIGINS` line from `backend/.env.example` if one exists.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_errors.py -v && python -c "from app.main import app; print(len(app.user_middleware), 'middlewares')"`
Expected: PASS, 8 tests; the import prints `0 middlewares`

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/errors.py backend/app/main.py backend/app/core/config.py backend/tests/test_errors.py
git commit -m "feat: add domain errors with one handler, delete CORS"
```

---

## Task 3: Refresh-token primitives

**Files:**
- Modify: `backend/app/core/security.py` (append)
- Test: `backend/tests/test_security.py` (append)

**Interfaces:**
- Consumes: `get_settings` from `app.core.config`
- Produces: `generate_refresh_token() -> str` (43-char URL-safe secret), `hash_refresh_token(token: str) -> str` (64-char hex), `refresh_expiry() -> datetime` (timezone-aware, `refresh_token_ttl_days` ahead)

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_security.py`:

```python
from datetime import datetime, timezone  # noqa: E402

from app.core.security import (  # noqa: E402
    generate_refresh_token,
    hash_refresh_token,
    refresh_expiry,
)


def test_refresh_tokens_are_unpredictable_and_unique() -> None:
    tokens = {generate_refresh_token() for _ in range(100)}
    assert len(tokens) == 100
    # 32 bytes of urandom, base64url-encoded without padding.
    assert all(len(token) == 43 for token in tokens)


def test_the_hash_is_deterministic_and_hides_the_token() -> None:
    # Stored hashed so a database disclosure hands over no live sessions.
    token = generate_refresh_token()
    digest = hash_refresh_token(token)
    assert digest == hash_refresh_token(token)
    assert len(digest) == 64
    assert token not in digest


def test_refresh_expiry_is_timezone_aware_and_in_the_future() -> None:
    # A naive datetime compared against a timestamptz column is a silent
    # offset bug, and the symptom is sessions that expire at the wrong hour.
    expiry = refresh_expiry()
    assert expiry.tzinfo is not None
    assert expiry > datetime.now(timezone.utc)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_security.py -v`
Expected: FAIL with `ImportError: cannot import name 'generate_refresh_token'`

- [ ] **Step 3: Write the primitives**

Append to `backend/app/core/security.py`:

```python
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
```

Add `import hashlib` and `import secrets` to the imports at the top of the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_security.py -v`
Expected: PASS, existing tests plus 3 new

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/security.py backend/tests/test_security.py
git commit -m "feat: add refresh token generation, hashing and expiry"
```

---

## Task 4: Signup

**Files:**
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/services/auth.py`
- Test: `backend/tests/test_auth_service.py`

**Interfaces:**
- Consumes: `User`, `RefreshToken`, `WorkspaceMember` from `app.models.auth`; `EmailTemplate` from `app.models.activity`; `Workspace` from `app.models.invoicing`; the security primitives from Task 3; the errors from Task 2
- Produces:
  - `TokenPair` (Pydantic): `access_token: str`, `refresh_token: str`, `expires_in: int`
  - `SessionUser` (Pydantic): `id: UUID`, `email: str`, `full_name: str`, `avatar_url: str | None`, `workspace_id: UUID`, `workspace_name: str`, `role: str`
  - `AuthResult` (Pydantic): `tokens: TokenPair`, `user: SessionUser`
  - `SignupRequest`: `full_name: str`, `email: EmailStr`, `password: str` (min 10)
  - `LoginRequest`: `email: EmailStr`, `password: str`
  - `AuthService(session: Session)` with `signup(request: SignupRequest) -> AuthResult`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_auth_service.py`:

```python
"""AuthService: what a session is, and how one is created."""

from __future__ import annotations

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.errors import Conflict
from app.models.activity import EmailTemplate
from app.models.auth import User, WorkspaceMember
from app.schemas.auth import SignupRequest
from app.services.auth import AuthService


def _signup(db: Session, email: str = "ada@example.com") -> object:
    return AuthService(db).signup(
        SignupRequest(full_name="Ada Lovelace", email=email, password="correct-horse-1")
    )


def test_signup_creates_a_workspace_owned_by_the_new_user(db: Session) -> None:
    result = _signup(db)

    assert result.user.email == "ada@example.com"
    assert result.user.role == "owner"
    member = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == result.user.workspace_id
        )
    )
    assert member is not None
    assert member.role == "owner"
    assert member.status == "active"


def test_signup_never_stores_the_password(db: Session) -> None:
    _signup(db)
    user = db.scalar(select(User).where(User.email == "ada@example.com"))
    assert user is not None
    assert "correct-horse-1" not in user.password_hash
    assert user.password_hash.startswith("$argon2")


def test_signup_seeds_the_three_reminder_templates(db: Session) -> None:
    # Seeded at creation so the first reminder a workspace sends has copy to
    # use. An empty template table means the send path has to invent one.
    result = _signup(db)
    tones = set(
        db.scalars(
            select(EmailTemplate.tone).where(
                EmailTemplate.workspace_id == result.user.workspace_id
            )
        )
    )
    assert tones == {"friendly", "firm", "final"}


def test_signup_issues_a_usable_token_pair(db: Session) -> None:
    from app.core.security import decode_access_token

    result = _signup(db)
    principal = decode_access_token(result.tokens.access_token)
    assert principal.workspace_id == result.user.workspace_id
    assert principal.role == "owner"
    assert result.tokens.expires_in == 30 * 60


def test_signing_up_twice_with_one_email_is_a_conflict(db: Session) -> None:
    _signup(db)
    with pytest.raises(Conflict):
        _signup(db, email="Ada@Example.com")


def test_the_workspace_slug_is_unique_across_signups(db: Session) -> None:
    # Two people with the same first name both get "Ada's workspace", and the
    # slug is unique. Without the suffix the second signup dies on the unique
    # constraint, which reads to the person as "signup is broken".
    first = _signup(db, email="ada@example.com")
    second = _signup(db, email="ada2@example.com")

    assert first.user.workspace_id != second.user.workspace_id
    slugs = set(
        db.scalars(
            text("SELECT slug FROM workspaces WHERE id IN (:a, :b)").bindparams(
                a=first.user.workspace_id, b=second.user.workspace_id
            )
        )
    )
    assert len(slugs) == 2
    assert all(slug.startswith("ada-s-workspace-") for slug in slugs)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_auth_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.schemas.auth'`

- [ ] **Step 3: Write the schemas**

Create `backend/app/schemas/auth.py`:

```python
"""Wire shapes for the auth endpoints.

These mirror the TypeScript in ``src/types/index.ts`` field for field,
snake_case included, so the DAL's Zod schema is a transcription rather than a
translation.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    # Length is the only rule that reliably predicts strength; matches the Zod
    # schema in auth-form.tsx so the two cannot disagree about what is valid.
    password: str = Field(min_length=10, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class RefreshRequest(BaseModel):
    refresh_token: str


class SwitchWorkspaceRequest(BaseModel):
    workspace_id: UUID


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    # Seconds, so the cookie's max-age can be set without the caller knowing
    # the configured TTL.
    expires_in: int


class SessionUser(BaseModel):
    id: UUID
    email: str
    full_name: str
    avatar_url: str | None
    workspace_id: UUID
    workspace_name: str
    role: str


class AuthResult(BaseModel):
    tokens: TokenPair
    user: SessionUser
```

- [ ] **Step 4: Write the service**

Create `backend/app/services/auth.py`:

```python
"""Sessions: creating them, proving them, rotating them, ending them.

The service owns the transaction. It flushes so it can read generated ids,
and commits once at the end of a use case -- a half-created workspace with no
owner is worse than a failed signup.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AuthenticationFailed, Conflict, NotFound
from app.core.security import (
    Principal,
    Role,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    issue_access_token,
    refresh_expiry,
    verify_password,
)
from app.models.activity import EmailTemplate
from app.models.auth import RefreshToken, User, WorkspaceMember
from app.models.invoicing import Workspace
from app.schemas.auth import (
    AuthResult,
    LoginRequest,
    SessionUser,
    SignupRequest,
    TokenPair,
)

# Seeded per workspace so the first reminder has copy to send. Placeholders are
# the same tokens the reminder service substitutes.
TEMPLATES: tuple[tuple[str, str, str, str], ...] = (
    (
        "Friendly nudge",
        "friendly",
        "A quick note about invoice {invoice_number}",
        "Hi {contact_name},\n\nInvoice {invoice_number} for {amount} was due on "
        "{due_date}. If it is already on its way, thank you -- please ignore "
        "this note.\n\n{payment_link}\n\nBest,\n{sender_name}",
    ),
    (
        "Firm reminder",
        "firm",
        "Invoice {invoice_number} is {days_overdue} days overdue",
        "Hi {contact_name},\n\nInvoice {invoice_number} for {amount} was due on "
        "{due_date} and is now {days_overdue} days overdue. Could you confirm "
        "when we can expect payment?\n\n{payment_link}\n\nThanks,\n{sender_name}",
    ),
    (
        "Final notice",
        "final",
        "Final notice: invoice {invoice_number}",
        "Hi {contact_name},\n\nInvoice {invoice_number} for {amount} remains "
        "unpaid {days_overdue} days after its due date. Please arrange payment "
        "within five business days so we can keep your account in good "
        "standing.\n\n{payment_link}\n\nRegards,\n{sender_name}",
    ),
)


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "workspace"


class AuthService:
    def __init__(self, session: Session) -> None:
        self.session = session

    # --- creating a session -------------------------------------------------

    def signup(self, request: SignupRequest) -> AuthResult:
        email = request.email.strip()
        existing = self.session.scalar(
            select(User).where(func.lower(User.email) == email.lower())
        )
        if existing is not None:
            # Signup can say this; login cannot. A signup form that accepted a
            # duplicate silently would strand the person on a login they have
            # no password for.
            raise Conflict("An account with that email already exists")

        user = User(
            id=uuid.uuid4(),
            email=email,
            full_name=request.full_name.strip(),
            password_hash=hash_password(request.password),
        )
        self.session.add(user)

        workspace_name = f"{user.full_name.split(' ')[0]}'s workspace"
        workspace = Workspace(
            id=uuid.uuid4(),
            name=workspace_name,
            # Suffixed with part of the id: two people with the same first name
            # must not collide on the unique slug.
            slug=f"{_slugify(workspace_name)}-{uuid.uuid4().hex[:6]}",
        )
        self.session.add(workspace)

        self.session.add(
            WorkspaceMember(
                id=uuid.uuid4(),
                workspace_id=workspace.id,
                user_id=user.id,
                role="owner",
                status="active",
            )
        )
        for name, tone, subject, body in TEMPLATES:
            self.session.add(
                EmailTemplate(
                    id=uuid.uuid4(),
                    workspace_id=workspace.id,
                    name=name,
                    tone=tone,
                    subject=subject,
                    body=body,
                )
            )

        self.session.flush()
        result = self._issue(user, workspace, "owner")
        self.session.commit()
        return result

    # --- shared -------------------------------------------------------------

    def _issue(self, user: User, workspace: Workspace, role: Role) -> AuthResult:
        """Mint an access token and a fresh refresh row for one user."""

        principal = Principal(
            user_id=user.id, workspace_id=workspace.id, role=role
        )
        access_token = issue_access_token(principal)

        refresh_token = generate_refresh_token()
        self.session.add(
            RefreshToken(
                id=uuid.uuid4(),
                user_id=user.id,
                token_hash=hash_refresh_token(refresh_token),
                expires_at=refresh_expiry(),
            )
        )
        self.session.flush()

        settings = get_settings()
        return AuthResult(
            tokens=TokenPair(
                access_token=access_token,
                refresh_token=refresh_token,
                expires_in=settings.access_token_ttl_minutes * 60,
            ),
            user=SessionUser(
                id=user.id,
                email=user.email,
                full_name=user.full_name,
                avatar_url=user.avatar_url,
                workspace_id=workspace.id,
                workspace_name=workspace.name,
                role=role,
            ),
        )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_auth_service.py -v`
Expected: PASS, 6 tests

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/auth.py backend/app/services/auth.py backend/tests/test_auth_service.py
git commit -m "feat: add signup creating a user, workspace, owner membership and templates"
```

---

## Task 5: Login, without an enumeration oracle

**Files:**
- Modify: `backend/app/services/auth.py` (append to `AuthService`)
- Modify: `backend/tests/test_auth_service.py` (append)

**Interfaces:**
- Consumes: `LoginRequest`, `AuthenticationFailed`, `verify_password`
- Produces: `AuthService.login(request: LoginRequest) -> AuthResult`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_auth_service.py`:

```python
from app.core.errors import AuthenticationFailed  # noqa: E402
from app.schemas.auth import LoginRequest  # noqa: E402


def test_login_returns_a_session_for_the_right_password(db: Session) -> None:
    _signup(db)
    result = AuthService(db).login(
        LoginRequest(email="ada@example.com", password="correct-horse-1")
    )
    assert result.user.email == "ada@example.com"
    assert result.user.role == "owner"


def test_login_is_case_insensitive_on_the_email(db: Session) -> None:
    _signup(db)
    result = AuthService(db).login(
        LoginRequest(email="ADA@example.com", password="correct-horse-1")
    )
    assert result.user.email == "ada@example.com"


def test_a_wrong_password_and_an_unknown_email_fail_identically(db: Session) -> None:
    # Identical exception type and message. Anything that distinguishes the two
    # turns this endpoint into a list of which emails have accounts.
    _signup(db)
    service = AuthService(db)

    with pytest.raises(AuthenticationFailed) as wrong_password:
        service.login(LoginRequest(email="ada@example.com", password="wrong-guess-99"))
    with pytest.raises(AuthenticationFailed) as unknown_email:
        service.login(LoginRequest(email="nobody@example.com", password="wrong-guess-99"))

    assert str(wrong_password.value) == str(unknown_email.value) == "Invalid credentials"


def test_an_unknown_email_still_verifies_a_hash(db: Session, monkeypatch) -> None:
    # The timing half of the same defence: if the unknown-email path returned
    # without hashing, it would answer in a millisecond while a real account
    # took argon2's ~300ms, and the clock would leak the answer.
    calls: list[str] = []
    import app.services.auth as auth_module

    real = auth_module.verify_password
    monkeypatch.setattr(
        auth_module,
        "verify_password",
        lambda plaintext, hashed: calls.append(hashed) or real(plaintext, hashed),
    )
    with pytest.raises(AuthenticationFailed):
        AuthService(db).login(
            LoginRequest(email="nobody@example.com", password="wrong-guess-99")
        )
    assert len(calls) == 1


def test_login_without_an_active_membership_fails(db: Session) -> None:
    # A user whose only membership was revoked has valid credentials and no
    # workspace to enter. Issuing a token with no workspace would be a token
    # every repository query then filters against nothing with.
    result = _signup(db)
    db.execute(
        text("UPDATE workspace_members SET status = 'invited' WHERE workspace_id = :ws"),
        {"ws": result.user.workspace_id},
    )
    with pytest.raises(AuthenticationFailed):
        AuthService(db).login(
            LoginRequest(email="ada@example.com", password="correct-horse-1")
        )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_auth_service.py -v`
Expected: FAIL with `AttributeError: 'AuthService' object has no attribute 'login'`

- [ ] **Step 3: Write login**

Append to the `AuthService` class in `backend/app/services/auth.py`:

```python
    # A real argon2 hash of a value nobody knows. Verified against when the
    # email is unknown, so the failing path costs the same wall-clock time as
    # the succeeding one.
    _DUMMY_HASH = hash_password(uuid.uuid4().hex)

    def login(self, request: LoginRequest) -> AuthResult:
        email = request.email.strip().lower()
        user = self.session.scalar(
            select(User).where(func.lower(User.email) == email)
        )

        password_hash = user.password_hash if user else self._DUMMY_HASH
        password_ok = verify_password(request.password, password_hash)
        if user is None or not password_ok:
            raise AuthenticationFailed()

        membership = self._active_membership(user.id)
        if membership is None:
            raise AuthenticationFailed()

        workspace, role = membership
        result = self._issue(user, workspace, role)
        self.session.commit()
        return result

    def _active_membership(
        self, user_id: uuid.UUID, workspace_id: uuid.UUID | None = None
    ) -> tuple[Workspace, Role] | None:
        """The workspace a login lands in.

        With no ``workspace_id``, the oldest active membership wins, which
        keeps a returning user in the workspace they think of as theirs rather
        than whichever one was created last.
        """

        stmt = (
            select(Workspace, WorkspaceMember.role)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
            .where(
                WorkspaceMember.user_id == user_id,
                WorkspaceMember.status == "active",
            )
            .order_by(WorkspaceMember.created_at)
        )
        if workspace_id is not None:
            stmt = stmt.where(Workspace.id == workspace_id)

        row = self.session.execute(stmt).first()
        if row is None:
            return None
        return row[0], row[1]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_auth_service.py -v`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/auth.py backend/tests/test_auth_service.py
git commit -m "feat: add login with a uniform failure for unknown emails"
```

---

## Task 6: Refresh rotation and chain revocation

**Files:**
- Modify: `backend/app/services/auth.py` (append to `AuthService`)
- Modify: `backend/tests/test_auth_service.py` (append)

**Interfaces:**
- Consumes: `RefreshToken`, `hash_refresh_token`
- Produces: `AuthService.refresh(token: str) -> AuthResult`, `AuthService.logout(token: str) -> None`, `AuthService.switch_workspace(principal: Principal, workspace_id: UUID) -> AuthResult`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_auth_service.py`:

```python
from uuid import uuid4  # noqa: E402

from app.core.security import decode_access_token, hash_refresh_token  # noqa: E402
from app.models.auth import RefreshToken  # noqa: E402


def _tokens(db: Session, email: str = "ada@example.com"):
    return _signup(db, email).tokens


def _row(db: Session, refresh_token: str) -> RefreshToken | None:
    return db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(refresh_token)
        )
    )


def test_refresh_issues_a_new_pair_and_retires_the_old_one(db: Session) -> None:
    first = _tokens(db)
    second = AuthService(db).refresh(first.refresh_token).tokens

    assert second.refresh_token != first.refresh_token
    old = _row(db, first.refresh_token)
    assert old is not None
    assert old.revoked_at is not None
    assert old.replaced_by_id is not None


def test_reusing_a_refresh_token_kills_the_whole_chain(db: Session) -> None:
    # A revoked token being presented means it leaked. Revoking only that row
    # would leave the thief's newer token alive, which is the one that matters.
    first = _tokens(db)
    service = AuthService(db)
    second = service.refresh(first.refresh_token).tokens
    third = service.refresh(second.refresh_token).tokens

    with pytest.raises(AuthenticationFailed):
        service.refresh(first.refresh_token)

    for token in (first, second, third):
        row = _row(db, token.refresh_token)
        assert row is not None and row.revoked_at is not None, token.refresh_token


def test_an_unknown_refresh_token_is_rejected(db: Session) -> None:
    with pytest.raises(AuthenticationFailed):
        AuthService(db).refresh("not-a-real-token")


def test_an_expired_refresh_token_is_rejected(db: Session) -> None:
    tokens = _tokens(db)
    db.execute(text("UPDATE refresh_tokens SET expires_at = now() - interval '1 day'"))
    with pytest.raises(AuthenticationFailed):
        AuthService(db).refresh(tokens.refresh_token)


def test_logout_revokes_the_presented_token_only(db: Session) -> None:
    tokens = _tokens(db)
    other = _tokens(db, email="grace@example.com")
    AuthService(db).logout(tokens.refresh_token)

    mine = _row(db, tokens.refresh_token)
    theirs = _row(db, other.refresh_token)
    assert mine is not None and mine.revoked_at is not None
    assert theirs is not None and theirs.revoked_at is None


def test_logging_out_twice_is_not_an_error(db: Session) -> None:
    # The Server Action clears cookies and calls this; a second click must not
    # produce a 401 page for someone who is already signed out.
    tokens = _tokens(db)
    service = AuthService(db)
    service.logout(tokens.refresh_token)
    service.logout(tokens.refresh_token)


def test_switching_to_a_workspace_you_do_not_belong_to_is_not_found(
    db: Session,
) -> None:
    # 404 rather than 403: a 403 confirms that workspace id exists.
    result = _signup(db)
    principal = decode_access_token(result.tokens.access_token)
    with pytest.raises(NotFound):
        AuthService(db).switch_workspace(principal, uuid4())


def test_switching_workspace_issues_a_token_for_the_new_scope(db: Session) -> None:
    from app.models.auth import WorkspaceMember as Member
    from app.models.invoicing import Workspace

    result = _signup(db)
    principal = decode_access_token(result.tokens.access_token)

    other = Workspace(id=uuid4(), name="Client co", slug=f"client-{uuid4().hex[:6]}")
    db.add(other)
    db.add(
        Member(
            id=uuid4(),
            workspace_id=other.id,
            user_id=principal.user_id,
            role="viewer",
            status="active",
        )
    )
    db.flush()

    switched = AuthService(db).switch_workspace(principal, other.id)
    new_principal = decode_access_token(switched.tokens.access_token)
    assert new_principal.workspace_id == other.id
    # The role travels with the workspace: an owner elsewhere is a viewer here.
    assert new_principal.role == "viewer"
```

Add `NotFound` to the `from app.core.errors import ...` line at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_auth_service.py -v`
Expected: FAIL with `AttributeError: 'AuthService' object has no attribute 'refresh'`

- [ ] **Step 3: Write rotation, logout and switching**

Append to the `AuthService` class in `backend/app/services/auth.py`:

```python
    # --- rotating and ending a session --------------------------------------

    def refresh(self, token: str) -> AuthResult:
        row = self.session.scalar(
            select(RefreshToken).where(
                RefreshToken.token_hash == hash_refresh_token(token)
            )
        )
        if row is None:
            raise AuthenticationFailed()

        if row.revoked_at is not None:
            # Presented after it was retired: either a replay or a stolen
            # token. Either way every session descended from it is suspect, so
            # the whole chain goes.
            self._revoke_chain(row)
            self.session.commit()
            raise AuthenticationFailed()

        if row.expires_at <= datetime.now(timezone.utc):
            raise AuthenticationFailed()

        user = self.session.get(User, row.user_id)
        if user is None:
            raise AuthenticationFailed()
        membership = self._active_membership(user.id)
        if membership is None:
            raise AuthenticationFailed()

        workspace, role = membership
        result = self._issue(user, workspace, role)

        row.revoked_at = datetime.now(timezone.utc)
        row.replaced_by_id = self.session.scalar(
            select(RefreshToken.id).where(
                RefreshToken.token_hash
                == hash_refresh_token(result.tokens.refresh_token)
            )
        )
        self.session.commit()
        return result

    def _revoke_chain(self, row: RefreshToken) -> None:
        """Walk ``replaced_by_id`` forward and revoke everything it reaches."""

        now = datetime.now(timezone.utc)
        seen: set[uuid.UUID] = set()
        current: RefreshToken | None = row
        while current is not None and current.id not in seen:
            seen.add(current.id)
            current.revoked_at = current.revoked_at or now
            next_id = current.replaced_by_id
            current = self.session.get(RefreshToken, next_id) if next_id else None

    def logout(self, token: str) -> None:
        row = self.session.scalar(
            select(RefreshToken).where(
                RefreshToken.token_hash == hash_refresh_token(token)
            )
        )
        # Signing out an already-dead session is not an error: the caller's
        # intent -- be signed out -- is satisfied either way.
        if row is not None and row.revoked_at is None:
            row.revoked_at = datetime.now(timezone.utc)
            self.session.commit()

    def switch_workspace(
        self, principal: Principal, workspace_id: uuid.UUID
    ) -> AuthResult:
        user = self.session.get(User, principal.user_id)
        if user is None:
            raise AuthenticationFailed()

        membership = self._active_membership(user.id, workspace_id)
        if membership is None:
            # 404, not 403: a 403 would confirm the workspace exists.
            raise NotFound("Workspace not found")

        workspace, role = membership
        result = self._issue(user, workspace, role)
        self.session.commit()
        return result
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_auth_service.py -v`
Expected: PASS, 19 tests

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/auth.py backend/tests/test_auth_service.py
git commit -m "feat: add single-use refresh rotation, chain revocation and workspace switching"
```

---

## Task 7: The auth endpoints

**Files:**
- Modify: `backend/app/api/routes/auth.py` (replace the file)
- Test: `backend/tests/test_auth_routes.py`

**Interfaces:**
- Consumes: `AuthService`, the schemas from Task 4, `SessionDep` and `PrincipalDep` from `app.api.deps`
- Produces: `POST /api/auth/signup` → `201 AuthResult`; `POST /api/auth/login` → `200 AuthResult`; `POST /api/auth/refresh` → `200 AuthResult`; `POST /api/auth/logout` → `204`; `POST /api/auth/switch-workspace` → `200 AuthResult`. `POST /api/auth/password-reset` stays `501`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_auth_routes.py`:

```python
"""The auth endpoints through the real ASGI app.

Status codes and response shape only -- the rules themselves are tested in
test_auth_service.py, and repeating them here would double the maintenance
without doubling the coverage.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

SIGNUP = {
    "full_name": "Ada Lovelace",
    "email": "ada@example.com",
    "password": "correct-horse-1",
}


def test_signup_returns_201_with_tokens_and_a_user(client: TestClient) -> None:
    response = client.post("/api/auth/signup", json=SIGNUP)
    assert response.status_code == 201
    body = response.json()
    assert body["tokens"]["access_token"]
    assert body["tokens"]["expires_in"] == 1800
    assert body["user"]["role"] == "owner"
    # The password must not come back in any form.
    assert "password" not in str(body)


def test_a_duplicate_signup_is_409(client: TestClient) -> None:
    client.post("/api/auth/signup", json=SIGNUP)
    assert client.post("/api/auth/signup", json=SIGNUP).status_code == 409


def test_a_short_password_is_422(client: TestClient) -> None:
    assert (
        client.post("/api/auth/signup", json={**SIGNUP, "password": "short"}).status_code
        == 422
    )


def test_login_returns_200_and_a_bad_password_returns_401(client: TestClient) -> None:
    client.post("/api/auth/signup", json=SIGNUP)
    assert (
        client.post(
            "/api/auth/login",
            json={"email": SIGNUP["email"], "password": SIGNUP["password"]},
        ).status_code
        == 200
    )
    bad = client.post(
        "/api/auth/login", json={"email": SIGNUP["email"], "password": "wrong-guess-99"}
    )
    assert bad.status_code == 401
    assert bad.json()["detail"] == "Invalid credentials"


def test_refresh_rotates_and_logout_returns_204(client: TestClient) -> None:
    created = client.post("/api/auth/signup", json=SIGNUP).json()
    refreshed = client.post(
        "/api/auth/refresh",
        json={"refresh_token": created["tokens"]["refresh_token"]},
    )
    assert refreshed.status_code == 200
    new_refresh = refreshed.json()["tokens"]["refresh_token"]
    assert new_refresh != created["tokens"]["refresh_token"]

    assert (
        client.post("/api/auth/logout", json={"refresh_token": new_refresh}).status_code
        == 204
    )


def test_switch_workspace_requires_a_bearer_token(client: TestClient) -> None:
    import uuid

    response = client.post(
        "/api/auth/switch-workspace", json={"workspace_id": str(uuid.uuid4())}
    )
    assert response.status_code == 403  # HTTPBearer rejects a missing header


def test_password_reset_is_still_not_implemented(client: TestClient) -> None:
    assert client.post("/api/auth/password-reset", json={}).status_code == 501
```

Add the `client` fixture to `backend/tests/conftest.py`:

```python
@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    """The real app, with the request-scoped session replaced by the test one.

    Without the override each request would open its own connection and commit
    outside the test's transaction, so the rollback between tests would leave
    rows behind.
    """

    from fastapi.testclient import TestClient

    from app.api.deps import get_session
    from app.main import app

    app.dependency_overrides[get_session] = lambda: db
    try:
        yield TestClient(app, raise_server_exceptions=False)
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_auth_routes.py -v`
Expected: FAIL — every endpoint answers `501`

- [ ] **Step 3: Write the routes**

Replace `backend/app/api/routes/auth.py` with:

```python
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status

from app.api.deps import PrincipalDep, SessionDep
from app.schemas.auth import (
    AuthResult,
    LoginRequest,
    RefreshRequest,
    SignupRequest,
    SwitchWorkspaceRequest,
)
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Routes are thin on purpose: validate, delegate, shape. Cookies are set by the
# Next.js Server Action that called this, because only it has a browser to set
# them on -- this service is private and never speaks to one.


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def create_signup(request: SignupRequest, session: SessionDep) -> AuthResult:
    """Create a user, their workspace, and a first session"""
    return AuthService(session).signup(request)


@router.post("/login")
def create_login(request: LoginRequest, session: SessionDep) -> AuthResult:
    """Exchange credentials for a token pair"""
    return AuthService(session).login(request)


@router.post("/refresh")
def create_refresh(request: RefreshRequest, session: SessionDep) -> AuthResult:
    """Rotate a refresh token"""
    return AuthService(session).refresh(request.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def create_logout(request: RefreshRequest, session: SessionDep) -> Response:
    """Revoke the current session"""
    AuthService(session).logout(request.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/switch-workspace")
def create_workspace_switch(
    request: SwitchWorkspaceRequest,
    session: SessionDep,
    principal: PrincipalDep,
) -> AuthResult:
    """Issue a token pair scoped to another workspace the caller belongs to"""
    return AuthService(session).switch_workspace(principal, request.workspace_id)


@router.post("/password-reset", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_password_reset() -> None:
    """Request a reset link"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not implemented: password reset needs the outbox from plan 4.",
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest -v`
Expected: PASS, the whole backend suite including the 7 new route tests

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/auth.py backend/tests/test_auth_routes.py backend/tests/conftest.py
git commit -m "feat: wire the auth endpoints to AuthService"
```

---

## A note on frontend verification

There is no JavaScript test runner in this repository, and the spec's testing
section deliberately does not add one — frontend correctness is covered by the
backend suite plus an OpenAPI contract diff. So the frontend tasks below verify
with `npx tsc --noEmit`, `npm run lint`, and one scripted browser check each.
Do not install vitest or jest as part of this plan.

Both servers must be running for the manual checks:

```bash
# terminal 1
cd backend && uvicorn app.main:app --reload --port 8000
# terminal 2
npm run dev
```

---

## Task 8: Cookie contract and the FastAPI client

**Files:**
- Create: `src/lib/auth/cookies.ts`
- Create: `src/lib/api/client.ts`
- Modify: `.env.local` (create if absent), `next.config.ts` is untouched

**Interfaces:**
- Consumes: `cookies()` from `next/headers`
- Produces:
  - `ACCESS_COOKIE = "ip_at"`, `REFRESH_COOKIE = "ip_rt"`
  - `sessionCookieOptions(maxAgeSeconds: number)` → the shared cookie option object
  - `setSessionCookies(tokens: { access_token: string; refresh_token: string; expires_in: number })` — writes both cookies; callable only from a Server Action or Route Handler
  - `clearSessionCookies()`
  - `apiFetch<T>(path: string, options: { method?: string; body?: unknown; schema: ZodType<T>; token?: string | null }) => Promise<T>` — throws `ApiError` with a `status` field
  - `ApiError extends Error` with `status: number` and `detail: string`

- [ ] **Step 1: Write the cookie module**

Create `src/lib/auth/cookies.ts`:

```ts
import { cookies } from "next/headers";

/**
 * The two session cookies.
 *
 * Both are httpOnly, so nothing the browser runs can read either one. That is
 * the whole reason the token lives here rather than in localStorage: an XSS
 * bug becomes a bug rather than a session theft.
 */
export const ACCESS_COOKIE = "ip_at";
export const REFRESH_COOKIE = "ip_rt";

export const REFRESH_MAX_AGE = 14 * 24 * 60 * 60;

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    // Off in development because localhost is not https; a secure cookie there
    // is simply never sent, and the symptom is a login that appears to do
    // nothing.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

/** Only callable from a Server Action or Route Handler — Next forbids cookie
 *  writes during a Server Component render. */
export async function setSessionCookies(tokens: TokenPair) {
  const store = await cookies();
  store.set(ACCESS_COOKIE, tokens.access_token, sessionCookieOptions(tokens.expires_in));
  store.set(REFRESH_COOKIE, tokens.refresh_token, sessionCookieOptions(REFRESH_MAX_AGE));
}

export async function clearSessionCookies() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export async function readAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value ?? null;
}

export async function readRefreshToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE)?.value ?? null;
}
```

- [ ] **Step 2: Write the client**

Create `src/lib/api/client.ts`:

```ts
import "server-only";

import { notFound, redirect } from "next/navigation";
import type { ZodType } from "zod";

import { readAccessToken } from "@/lib/auth/cookies";

/**
 * The only place in the frontend that builds a URL to FastAPI.
 *
 * Pages and actions import functions from `src/lib/api/`; none of them knows a
 * path. That is what keeps the API surface changeable without a grep across
 * the app directory.
 */
const BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`${status}: ${detail}`);
    this.name = "ApiError";
  }
}

type RequestOptions<T> = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  schema: ZodType<T>;
  /** Pass explicitly when the caller holds a token the cookie does not yet
   *  have — a login response, or proxy.ts mid-rotation. */
  token?: string | null;
  /** Next cache tags for reads. Writes pass nothing and are never cached. */
  tags?: string[];
};

export async function apiFetch<T>(
  path: string,
  options: RequestOptions<T>,
): Promise<T> {
  const token =
    options.token === undefined ? await readAccessToken() : options.token;

  const response = await fetch(`${BASE_URL}/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    // Every response is per-user. Caching one would serve one tenant's ledger
    // to another.
    cache: "no-store",
    ...(options.tags ? { next: { tags: options.tags } } : {}),
  });

  if (!response.ok) {
    const detail = await readDetail(response);
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) return options.schema.parse(undefined);

  // Parsed rather than cast: an unvalidated `as` turns a backend field rename
  // into `undefined` inside a currency formatter, three screens away.
  return options.schema.parse(await response.json());
}

async function readDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === "string" ? body.detail : response.statusText;
  } catch {
    return response.statusText;
  }
}

/**
 * The read-path error policy from the spec: 401 means the session is gone,
 * 404 means render the not-found page, anything else reaches the existing
 * error boundary.
 */
export function handleReadError(error: unknown): never {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/login");
    if (error.status === 404) notFound();
  }
  throw error;
}
```

- [ ] **Step 3: Point the app at the backend**

Create `.env.local` (git-ignored) with:

```bash
API_BASE_URL=http://127.0.0.1:8000
```

and add the same line, without a value, to a new `.env.example`:

```bash
# The private FastAPI origin. Never NEXT_PUBLIC_: the browser must not learn it.
API_BASE_URL=
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: exits 0. If `server-only` is missing, run `npm install server-only` first and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/cookies.ts src/lib/api/client.ts .env.example package.json package-lock.json
git commit -m "feat: add the session cookie contract and the FastAPI client"
```

---

## Task 9: The session read

**Files:**
- Create: `src/lib/api/session.ts`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError`, `readAccessToken`
- Produces: `sessionUserSchema` (Zod), `type SessionUser`, `getSession(): Promise<SessionUser | null>` (React-`cache()`d), `requireSession(): Promise<SessionUser>` (redirects to `/login` when absent)

- [ ] **Step 1: Write the module**

Create `src/lib/api/session.ts`:

```ts
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ApiError, apiFetch } from "@/lib/api/client";
import { readAccessToken } from "@/lib/auth/cookies";

export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  full_name: z.string(),
  avatar_url: z.string().nullable(),
  workspace_id: z.string(),
  workspace_name: z.string(),
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

/**
 * Who is signed in, according to FastAPI.
 *
 * The DAL does not verify the JWT itself: that would mean sharing SECRET_KEY
 * with Next for no gain. It forwards the token and lets the service that
 * signed it decide. Wrapped in cache() so a layout, a page and three
 * components asking during one render make one request.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = await readAccessToken();
  if (!token) return null;

  try {
    return await apiFetch("/users/me", { schema: sessionUserSchema, token });
  } catch (error) {
    // An expired access token is an ordinary event: proxy.ts refreshes on the
    // next navigation. Treating it as signed-out here is correct and quiet.
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
});

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
```

- [ ] **Step 2: Make `/users/me` return a session user**

`getSession` calls `GET /api/users/me`, which is still `501`. In
`backend/app/api/routes/users.py`, replace the `/me` route with:

```python
@router.get("/me")
def get_me(session: SessionDep, principal: PrincipalDep) -> SessionUser:
    """The signed-in user, scoped to the workspace in their token"""
    return AuthService(session).describe(principal)
```

adding `from app.schemas.auth import SessionUser` and
`from app.services.auth import AuthService` to its imports, and append to
`AuthService` in `backend/app/services/auth.py`:

```python
    def describe(self, principal: Principal) -> SessionUser:
        """Render a principal as the session the frontend renders a shell from."""

        user = self.session.get(User, principal.user_id)
        workspace = self.session.get(Workspace, principal.workspace_id)
        if user is None or workspace is None:
            raise AuthenticationFailed()
        return SessionUser(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            avatar_url=user.avatar_url,
            workspace_id=workspace.id,
            workspace_name=workspace.name,
            role=principal.role,
        )
```

- [ ] **Step 3: Cover the new endpoint**

Append to `backend/tests/test_auth_routes.py`:

```python
def test_me_returns_the_signed_in_user(client: TestClient) -> None:
    created = client.post("/api/auth/signup", json=SIGNUP).json()
    response = client.get(
        "/api/users/me",
        headers={"Authorization": f"Bearer {created['tokens']['access_token']}"},
    )
    assert response.status_code == 200
    assert response.json()["email"] == SIGNUP["email"]
    assert response.json()["workspace_id"] == created["user"]["workspace_id"]


def test_me_without_a_token_is_401_or_403(client: TestClient) -> None:
    assert client.get("/api/users/me").status_code in (401, 403)
```

- [ ] **Step 4: Run the checks**

Run: `cd backend && pytest tests/test_auth_routes.py -v` then `npx tsc --noEmit` from the repository root
Expected: pytest PASS (9 tests); `tsc` exits 0

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/session.ts backend/app/api/routes/users.py backend/app/services/auth.py backend/tests/test_auth_routes.py
git commit -m "feat: add the session DAL read and the /users/me endpoint behind it"
```

---

## Task 10: Proxy — optimistic check and refresh rotation

**Files:**
- Create: `src/proxy.ts`

**Interfaces:**
- Consumes: `ACCESS_COOKIE`, `REFRESH_COOKIE`, `sessionCookieOptions`, `REFRESH_MAX_AGE`
- Produces: the `proxy` export and its `config.matcher`. Nothing imports from this file.

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
before editing. In Next 16 the file is `proxy.ts`, not `middleware.ts`, and it
lives beside `app/` — so `src/proxy.ts` in this repository.

- [ ] **Step 1: Write the proxy**

Create `src/proxy.ts`:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
  sessionCookieOptions,
} from "@/lib/auth/cookies";

/**
 * Two jobs, and deliberately no third.
 *
 * 1. The optimistic check: is there a session cookie at all. This is a
 *    redirect convenience, never the authorisation — FastAPI verifies every
 *    request, and a forged cookie gets a 401 from the DAL regardless.
 * 2. Refresh rotation. Refreshing writes cookies, and Next does not allow
 *    cookie writes during a Server Component render, so this is the only place
 *    in the render path that can do it.
 *
 * No database calls: this runs on every navigation including prefetches.
 */
const SIGNED_IN_ROOTS = [
  "/dashboard",
  "/invoices",
  "/customers",
  "/collections",
  "/payments",
  "/reports",
  "/automations",
  "/integrations",
  "/settings",
  "/ai",
  "/onboarding",
];

const SIGNED_OUT_ONLY = ["/login", "/signup", "/forgot-password"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  const isProtected = SIGNED_IN_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
  const isAuthPage = SIGNED_OUT_ONLY.includes(pathname);

  if (access) {
    if (isAuthPage) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // No access token but a refresh token: the 30-minute access token expired
  // between navigations. Swap it before the page renders, so the person never
  // sees a login screen they did not ask for.
  if (refresh) {
    const rotated = await rotate(refresh);
    if (rotated) {
      const response = isAuthPage
        ? NextResponse.redirect(new URL("/dashboard", request.url))
        : NextResponse.next();
      response.cookies.set(
        ACCESS_COOKIE,
        rotated.access_token,
        sessionCookieOptions(rotated.expires_in),
      );
      response.cookies.set(
        REFRESH_COOKIE,
        rotated.refresh_token,
        sessionCookieOptions(REFRESH_MAX_AGE),
      );
      return response;
    }

    // Rotation failed: the token was reused, revoked or expired. Clear both
    // cookies, or every subsequent navigation retries a rotation that cannot
    // succeed.
    const response = isProtected
      ? NextResponse.redirect(new URL("/login", request.url))
      : NextResponse.next();
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  }

  if (isProtected) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

async function rotate(
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null> {
  try {
    const response = await fetch(
      `${process.env.API_BASE_URL ?? "http://127.0.0.1:8000"}/api/auth/refresh`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      tokens: { access_token: string; refresh_token: string; expires_in: number };
    };
    return body.tokens;
  } catch {
    // The backend being unreachable must not hard-fail every navigation.
    return null;
  }
}

export const config = {
  // Without a matcher the proxy runs on static assets too, and the redirect
  // above would block CSS and images from loading.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
```

- [ ] **Step 2: Verify the redirect for a signed-out visitor**

Run, with both servers up:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/dashboard
```

Expected: `307 http://localhost:3000/login?next=%2Fdashboard`

- [ ] **Step 3: Verify a marketing page is untouched**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/pricing`
Expected: `200`

- [ ] **Step 4: Commit**

```bash
git add src/proxy.ts
git commit -m "feat: add proxy with the optimistic session check and refresh rotation"
```

---

## Task 11: The auth Server Actions and the real form

**Files:**
- Create: `src/lib/actions/auth.ts`
- Modify: `src/components/auth/auth-form.tsx:57-84` (the component's submit path)

**Interfaces:**
- Consumes: `apiFetch`, `ApiError`, `setSessionCookies`, `clearSessionCookies`, `sessionUserSchema`
- Produces: `type ActionResult = { ok: true } | { ok: false; message: string; field?: string }`, and the actions `login(input)`, `signup(input)`, `logout()`, `switchWorkspace(workspaceId)` — each returning `ActionResult`, none throwing on an expected failure

- [ ] **Step 1: Write the actions**

Create `src/lib/actions/auth.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ApiError, apiFetch } from "@/lib/api/client";
import { sessionUserSchema } from "@/lib/api/session";
import {
  clearSessionCookies,
  readRefreshToken,
  setSessionCookies,
} from "@/lib/auth/cookies";

/**
 * Actions return a result instead of throwing.
 *
 * A thrown error in a Server Action replaces the page with the error boundary,
 * which is the wrong response to "that password is wrong" — the person needs
 * the form back, with the message next to the field.
 */
export type ActionResult =
  | { ok: true }
  | { ok: false; message: string; field?: "email" | "password" | "full_name" };

const authResponseSchema = z.object({
  tokens: z.object({
    access_token: z.string(),
    refresh_token: z.string(),
    expires_in: z.number(),
  }),
  user: sessionUserSchema,
});

// The same rules as the form's Zod schema, restated server-side: a Server
// Action is a public endpoint, and the client's validation is a convenience.
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signupSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(10),
});

export async function login(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Check your email and password.", field: "email" };
  }

  try {
    const result = await apiFetch("/auth/login", {
      method: "POST",
      body: parsed.data,
      schema: authResponseSchema,
      token: null,
    });
    await setSessionCookies(result.tokens);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // Deliberately not "no account with that email": the backend refuses to
      // distinguish the two, and so must the message the form shows.
      return {
        ok: false,
        message: "That email and password do not match.",
        field: "password",
      };
    }
    return { ok: false, message: "Something went wrong. Try again." };
  }
}

export async function signup(input: unknown): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Check the form and try again.", field: "email" };
  }

  try {
    const result = await apiFetch("/auth/signup", {
      method: "POST",
      body: parsed.data,
      schema: authResponseSchema,
      token: null,
    });
    await setSessionCookies(result.tokens);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return {
        ok: false,
        message: "An account with that email already exists.",
        field: "email",
      };
    }
    return { ok: false, message: "Something went wrong. Try again." };
  }
}

export async function logout(): Promise<ActionResult> {
  const refreshToken = await readRefreshToken();
  // Cookies are cleared whatever the backend says. A failed revoke must not
  // leave someone apparently signed in on a shared machine.
  await clearSessionCookies();

  if (refreshToken) {
    try {
      await apiFetch("/auth/logout", {
        method: "POST",
        body: { refresh_token: refreshToken },
        schema: z.undefined(),
        token: null,
      });
    } catch {
      // Already revoked, or the backend is down. Either way, signed out here.
    }
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function switchWorkspace(workspaceId: string): Promise<ActionResult> {
  try {
    const result = await apiFetch("/auth/switch-workspace", {
      method: "POST",
      body: { workspace_id: workspaceId },
      schema: authResponseSchema,
    });
    await setSessionCookies(result.tokens);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { ok: false, message: "You no longer have access to that workspace." };
    }
    return { ok: false, message: "Could not switch workspace." };
  }
}
```

- [ ] **Step 2: Convert the form**

In `src/components/auth/auth-form.tsx`, add the imports:

```ts
import { login as loginAction, signup as signupAction } from "@/lib/actions/auth";
```

and replace the whole `onSubmit` function (currently the `setTimeout` block) with:

```ts
  async function onSubmit(values: Record<string, string>) {
    setPending(true);

    if (mode === "reset") {
      // Password reset needs the outbox, which arrives in plan 4. The copy
      // already says "if that address has an account", so this stays honest.
      setPending(false);
      toast.success(copy.success, { description: copy.detail });
      return;
    }

    const result =
      mode === "login" ? await loginAction(values) : await signupAction(values);
    setPending(false);

    if (!result.ok) {
      // Shown against the field the backend blamed, so the person's eye lands
      // on the input they have to change.
      if (result.field) {
        form.setError(result.field, { message: result.message });
      } else {
        toast.error("That did not work", { description: result.message });
      }
      return;
    }

    toast.success(copy.success, { description: copy.detail });
    router.push(mode === "signup" ? "/onboarding" : "/dashboard");
    router.refresh();
  }
```

The `handleSubmit(onSubmit)` call already passes the form values, so no other
change to the JSX is needed.

- [ ] **Step 3: Verify the round trip by hand**

With both servers up and a migrated database:

```bash
curl -s -X POST http://127.0.0.1:8000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"full_name":"Ada Lovelace","email":"ada@example.com","password":"correct-horse-1"}' \
  | head -c 200
```

Expected: JSON containing `"role":"owner"`.

Then in a browser: visit `http://localhost:3000/login`, sign in as
`ada@example.com`, and confirm you land on `/dashboard`. Sign in again with a
wrong password and confirm the message appears under the password field rather
than as a full-page error.

- [ ] **Step 4: Verify the cookies are unreadable from the page**

In the browser console on `/dashboard`, run `document.cookie`.
Expected: neither `ip_at` nor `ip_rt` appears — both are httpOnly.

- [ ] **Step 5: Run the static checks**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/auth.ts src/components/auth/auth-form.tsx
git commit -m "feat: replace the simulated login with real signup, login and logout actions"
```

---

## Task 12: The shell on a real session

**Files:**
- Modify: `src/app/(app)/layout.tsx:1-40` (the fixture imports for user and workspace)
- Modify: `src/components/shell/workspace-switcher.tsx:28-40, 70-83`

**Interfaces:**
- Consumes: `requireSession` from `src/lib/api/session.ts`, `switchWorkspace` from `src/lib/actions/auth.ts`
- Produces: nothing new. The layout passes a real `SessionUser` into the shell; the switcher calls the action rather than holding local state.

The invoice, customer and notification props in this layout stay on fixtures —
they belong to plan 3. This task changes **only** who is signed in and which
workspace is active.

- [ ] **Step 1: Give the layout a real session**

In `src/app/(app)/layout.tsx`, add:

```ts
import { requireSession } from "@/lib/api/session";
```

make the component async, and take the identity from the session rather than
the fixture:

```ts
export default async function AppLayout({ children }: LayoutProps<"/">) {
  // The only unfaked data in this layout for now: who is signed in, and which
  // workspace their token is scoped to. Everything below is still fixtures
  // until plan 3 converts the read path.
  const session = await requireSession();
```

Then replace the `currentUser` and `workspace` fixture values where they are
passed into `TopBar` and `AppSidebar` with values derived from `session`:

```ts
  const currentUser = {
    id: session.id,
    email: session.email,
    full_name: session.full_name,
    avatar_url: session.avatar_url,
  };
  const activeWorkspace = { id: session.workspace_id, name: session.workspace_name };
```

and drop `currentUser` and `workspace` from the `@/lib/data` import list, keeping
the rest.

- [ ] **Step 2: Wire the switcher to the action**

In `src/components/shell/workspace-switcher.tsx`, replace the `useState`
selection with a transition that calls the action, because switching workspace
now means a new token rather than a local highlight:

```ts
import { useTransition } from "react";
import { toast } from "sonner";

import { switchWorkspace } from "@/lib/actions/auth";
```

```ts
export function WorkspaceSwitcher({
  workspaces,
  activeId,
}: {
  workspaces: Workspace[];
  activeId: string;
}) {
  const [pending, startTransition] = useTransition();
  // No local selected-id state: the active workspace is whatever the access
  // token says, so the server is the only thing that can change it.
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0]!;

  function select(id: string) {
    if (id === activeId) return;
    startTransition(async () => {
      const result = await switchWorkspace(id);
      if (!result.ok) toast.error("Could not switch", { description: result.message });
    });
  }
```

and in the dropdown items:

```tsx
              <DropdownMenuItem
                key={w.id}
                onClick={() => select(w.id)}
                disabled={pending}
                className="gap-2"
              >
```

with the `Check` comparison left as it is.

- [ ] **Step 3: Verify the shell**

With both servers up: sign in, and confirm the sidebar shows the workspace name
that signup generated (`Ada's workspace`) and the top bar shows `Ada Lovelace`,
neither of which appears anywhere in `src/lib/data/`.

Then delete the `ip_at` and `ip_rt` cookies in devtools and reload `/dashboard`.
Expected: redirected to `/login?next=%2Fdashboard`.

- [ ] **Step 4: Run the static checks**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/layout.tsx" src/components/shell/workspace-switcher.tsx
git commit -m "feat: render the app shell from the real session"
```

---

## Done when

- `pytest` passes in `backend/`: the permission matrix, the error map, the
  refresh primitives, 19 auth-service tests and 9 route tests, alongside
  everything plan 1 left green
- A real signup at `http://localhost:3000/signup` creates a user, a workspace
  and an owner membership in Postgres, and lands on `/onboarding`
- Signing in reaches `/dashboard`, and the sidebar shows the workspace name
  from the database
- `document.cookie` on `/dashboard` shows neither session cookie
- Deleting the cookies and reloading redirects to `/login`
- `grep -rn "CORSMiddleware\|cors_origins" backend/` returns nothing
- `npx tsc --noEmit` and `npm run lint` both exit 0

**Not in this plan:** every screen still renders its numbers from
`src/lib/data/`. Converting the read path — invoices, customers, collections,
payments, reports — is plan 3. Password reset waits for the outbox in plan 4.
