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
