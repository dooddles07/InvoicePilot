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
