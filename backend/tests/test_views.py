"""The derivation views.

Each test builds the smallest ledger that distinguishes the rule from a
plausible wrong rule, then asserts what the view says about it.
"""

from __future__ import annotations

import uuid

from sqlalchemy import text
from sqlalchemy.orm import Session

from tests.helpers import make_customer, make_invoice


def _state(db: Session, invoice_id: uuid.UUID):
    return db.execute(
        text("SELECT * FROM invoice_state WHERE id = :id"), {"id": invoice_id}
    ).one()


def test_days_overdue_counts_from_the_due_date(
    db: Session, workspace_id: uuid.UUID
) -> None:
    customer_id = make_customer(db, workspace_id, name="Late Co")
    invoice_id = make_invoice(
        db, workspace_id, customer_id, amount=100_000, due_offset_days=-40
    )
    assert _state(db, invoice_id).days_overdue == 40


def test_days_overdue_is_negative_before_the_due_date(
    db: Session, workspace_id: uuid.UUID
) -> None:
    # Negative rather than zero or null, so a caller can sort every open
    # invoice on one column and get "most overdue first" for free.
    customer_id = make_customer(db, workspace_id, name="Early Co")
    invoice_id = make_invoice(
        db, workspace_id, customer_id, amount=100_000, due_offset_days=10
    )
    assert _state(db, invoice_id).days_overdue == -10


def test_a_paid_invoice_past_its_due_date_is_not_overdue(
    db: Session, workspace_id: uuid.UUID
) -> None:
    # It was paid late; it is not owed. Owing money is what overdue means.
    customer_id = make_customer(db, workspace_id, name="Paid Late Co")
    invoice_id = make_invoice(
        db,
        workspace_id,
        customer_id,
        amount=100_000,
        paid=100_000,
        due_offset_days=-40,
        paid_offset_days=-5,
        status="paid",
    )
    assert _state(db, invoice_id).is_overdue is False


def test_a_draft_past_its_due_date_is_not_overdue(
    db: Session, workspace_id: uuid.UUID
) -> None:
    # A draft was never sent, so nobody owes anything yet. Counting drafts
    # would fill the collections queue with invoices the customer has never
    # seen.
    customer_id = make_customer(db, workspace_id, name="Draft Co")
    invoice_id = make_invoice(
        db,
        workspace_id,
        customer_id,
        amount=100_000,
        due_offset_days=-40,
        status="draft",
    )
    assert _state(db, invoice_id).is_overdue is False


def test_a_partially_paid_late_invoice_is_overdue_for_its_balance(
    db: Session, workspace_id: uuid.UUID
) -> None:
    customer_id = make_customer(db, workspace_id, name="Partial Co")
    invoice_id = make_invoice(
        db,
        workspace_id,
        customer_id,
        amount=100_000,
        paid=30_000,
        due_offset_days=-15,
        status="partially_paid",
    )
    row = _state(db, invoice_id)
    assert row.is_overdue is True
    assert row.balance_cents == 70_000
    assert row.customer_name == "Partial Co"
