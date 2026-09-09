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

        # None of these models declare an ORM relationship() back to Workspace
        # or User -- only a bare foreign-key column -- so the unit of work has
        # no signal to order INSERTs across tables and a single flush can send
        # the child rows first. Flush the parents before adding their children.
        # (Same reasoning as app/seeds/demo.py.)
        self.session.flush()

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

    # --- shared -----------------------------------------------------------

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
