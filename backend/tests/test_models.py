"""Model-level structure. Constraint behaviour is tested after the migration."""

from __future__ import annotations

from app.models.auth import RefreshToken, User, WorkspaceMember
from app.models.activity import (
    AuditLog,
    CollectionEvent,
    CommunicationLog,
    EmailTemplate,
    ImportBatch,
)
from sqlalchemy import Computed

from app.models.invoicing import Invoice, InvoiceStatus


def test_user_is_not_workspace_scoped() -> None:
    # A user may belong to several workspaces, so the row cannot carry one.
    assert not hasattr(User, "workspace_id")
    assert User.__tablename__ == "users"


def test_refresh_token_stores_a_hash_and_a_rotation_link() -> None:
    assert hasattr(RefreshToken, "token_hash")
    assert hasattr(RefreshToken, "replaced_by_id")
    assert hasattr(RefreshToken, "revoked_at")
    # The plaintext token must never be stored.
    assert not hasattr(RefreshToken, "token")


def test_workspace_member_is_workspace_scoped() -> None:
    assert hasattr(WorkspaceMember, "workspace_id")
    assert hasattr(WorkspaceMember, "user_id")
    assert hasattr(WorkspaceMember, "role")


def test_communication_log_is_unique_per_workspace_and_key() -> None:
    # This constraint is the whole idempotency mechanism: a second send for the
    # same invoice, tone and day collides here rather than emailing twice.
    names = {c.name for c in CommunicationLog.__table__.constraints}
    assert "uq_communication_logs_workspace_key" in names


def test_activity_tables_are_workspace_scoped() -> None:
    for model in (
        CollectionEvent,
        CommunicationLog,
        AuditLog,
        EmailTemplate,
        ImportBatch,
    ):
        assert hasattr(model, "workspace_id"), model.__name__


def test_overdue_is_not_a_stored_status() -> None:
    # Overdue is time-derived. Storing it means a row goes stale at midnight.
    assert not hasattr(InvoiceStatus, "overdue")
    assert {s.value for s in InvoiceStatus} == {
        "draft",
        "sent",
        "viewed",
        "partially_paid",
        "paid",
        "disputed",
    }


def test_balance_is_a_generated_column_not_a_property() -> None:
    # The collections ranking sorts on balance in SQL, which a Python property
    # cannot do.
    column = Invoice.__table__.c.balance_cents
    assert isinstance(column.server_default, Computed)


def test_invoice_does_not_store_risk() -> None:
    # Risk is the customer's grade, defined once in the customer_stats view.
    assert "risk" not in Invoice.__table__.c
