"""AuthService: what a session is, and how one is created."""

from __future__ import annotations

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound
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
    # Flush the parent first: no ORM relationship() links these, so a single
    # flush can send the member row before the workspace it references.
    db.flush()
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
