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
