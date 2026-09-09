"""What migration 0002 must have done to the database.

These assertions run against the migrated database the ``engine`` fixture
builds, so they test the migration itself, not the models.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from tests.helpers import make_customer, make_invoice


def test_overdue_is_gone_from_the_invoice_status_enum(db: Session) -> None:
    values = set(
        db.scalars(
            text(
                """
                SELECT e.enumlabel
                FROM pg_enum e
                JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'invoice_status'
                """
            )
        )
    )
    assert values == {
        "draft",
        "sent",
        "viewed",
        "partially_paid",
        "paid",
        "disputed",
    }


def test_invoices_no_longer_store_risk(db: Session) -> None:
    columns = set(
        db.scalars(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'invoices'"
            )
        )
    )
    assert "risk" not in columns
    assert {"sent_at", "viewed_at", "balance_cents"} <= columns


def test_balance_is_generated_and_clamped_at_zero(
    db: Session, workspace_id: uuid.UUID
) -> None:
    customer_id = make_customer(db, workspace_id, name="Balance Co")
    invoice_id = make_invoice(
        db, workspace_id, customer_id, amount=100_000, paid=40_000
    )

    balance = db.scalar(
        text("SELECT balance_cents FROM invoices WHERE id = :id"), {"id": invoice_id}
    )
    assert balance == 60_000

    # The column is generated, so it tracks a later payment with no write of
    # its own. That is the property a Python attribute cannot give us.
    db.execute(
        text("UPDATE invoices SET paid_cents = 100000 WHERE id = :id"),
        {"id": invoice_id},
    )
    assert (
        db.scalar(
            text("SELECT balance_cents FROM invoices WHERE id = :id"),
            {"id": invoice_id},
        )
        == 0
    )


def test_balance_cannot_be_written_directly(
    db: Session, workspace_id: uuid.UUID
) -> None:
    # Postgres refuses a write to a generated column. This test is what stops
    # a future service quietly "correcting" a balance and desyncing the ledger.
    customer_id = make_customer(db, workspace_id, name="No Writes Co")
    invoice_id = make_invoice(db, workspace_id, customer_id, amount=100_000)
    with pytest.raises(Exception):
        db.execute(
            text("UPDATE invoices SET balance_cents = 1 WHERE id = :id"),
            {"id": invoice_id},
        )


def test_email_is_unique_case_insensitively(db: Session) -> None:
    # Signing up as Sam@example.com when sam@example.com exists must collide,
    # or two accounts share one inbox and password reset becomes ambiguous.
    db.execute(
        text(
            "INSERT INTO users (id, email, full_name, password_hash) "
            "VALUES (:id, 'sam@example.com', 'Sam', 'x')"
        ),
        {"id": uuid.uuid4()},
    )
    with pytest.raises(IntegrityError):
        db.execute(
            text(
                "INSERT INTO users (id, email, full_name, password_hash) "
                "VALUES (:id, 'Sam@example.com', 'Sam Again', 'x')"
            ),
            {"id": uuid.uuid4()},
        )


def test_the_outbox_rejects_a_repeated_idempotency_key(
    db: Session, workspace_id: uuid.UUID
) -> None:
    customer_id = make_customer(db, workspace_id, name="Outbox Co")
    statement = text(
        """
        INSERT INTO communication_logs (
            id, workspace_id, customer_id, channel, to_address,
            subject, body, status, idempotency_key, queued_at
        ) VALUES (
            :id, :workspace_id, :customer_id, 'email', 'a@example.test',
            'Reminder', 'Body', 'queued', 'key-1', now()
        )
        """
    )
    db.execute(
        statement,
        {"id": uuid.uuid4(), "workspace_id": workspace_id, "customer_id": customer_id},
    )
    with pytest.raises(IntegrityError):
        db.execute(
            statement,
            {
                "id": uuid.uuid4(),
                "workspace_id": workspace_id,
                "customer_id": customer_id,
            },
        )
