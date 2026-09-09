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


def _stats(db: Session, customer_id):
    return db.execute(
        text("SELECT * FROM customer_stats WHERE customer_id = :id"),
        {"id": customer_id},
    ).one()


def test_a_customer_with_no_history_is_low_risk(db: Session, workspace_id) -> None:
    # Grading a brand-new customer 'high' would flag every account on the day
    # it is created, which trains people to ignore the badge.
    customer_id = make_customer(db, workspace_id, name="Brand New")

    row = _stats(db, customer_id)
    assert row.risk == "low"
    assert row.risk_reason == "No payment history yet"
    assert row.outstanding_cents == 0
    assert row.open_invoice_count == 0


def test_outstanding_and_overdue_are_separate_sums(db: Session, workspace_id) -> None:
    customer_id = make_customer(db, workspace_id, name="Mixed")
    make_invoice(db, workspace_id, customer_id, amount=100_000, due_offset_days=-5)
    make_invoice(db, workspace_id, customer_id, amount=40_000, due_offset_days=20)

    row = _stats(db, customer_id)
    assert row.outstanding_cents == 140_000
    assert row.overdue_cents == 100_000
    assert row.open_invoice_count == 2


def test_on_time_rate_counts_settled_invoices_only(db: Session, workspace_id) -> None:
    customer_id = make_customer(db, workspace_id, name="Settled")
    # Three paid: two on time, one late.
    make_invoice(db, workspace_id, customer_id, amount=10_000, paid=10_000,
                 due_offset_days=-60, paid_offset_days=-65, status="paid")
    make_invoice(db, workspace_id, customer_id, amount=10_000, paid=10_000,
                 due_offset_days=-50, paid_offset_days=-52, status="paid")
    make_invoice(db, workspace_id, customer_id, amount=10_000, paid=10_000,
                 due_offset_days=-40, paid_offset_days=-20, status="paid")

    row = _stats(db, customer_id)
    assert row.on_time_rate == 67  # 2 of 3, rounded


def test_a_long_overdue_balance_grades_high(db: Session, workspace_id) -> None:
    customer_id = make_customer(db, workspace_id, name="Stale")
    make_invoice(db, workspace_id, customer_id, amount=100_000, due_offset_days=-90)

    row = _stats(db, customer_id)
    assert row.risk == "high"
    assert "90 days past due" in row.risk_reason


def test_a_slightly_late_balance_grades_medium(db: Session, workspace_id) -> None:
    customer_id = make_customer(db, workspace_id, name="Slipping")
    make_invoice(db, workspace_id, customer_id, amount=100_000, due_offset_days=-20)

    row = _stats(db, customer_id)
    assert row.risk == "medium"


def test_stats_never_return_null_for_a_customer_without_invoices(
    db: Session, workspace_id
) -> None:
    # NULL propagates through every downstream sum and percentage.
    customer_id = make_customer(db, workspace_id, name="Empty")
    row = _stats(db, customer_id)
    for field in (
        "outstanding_cents",
        "overdue_cents",
        "total_invoiced_cents",
        "avg_days_to_pay",
        "on_time_rate",
        "open_invoice_count",
        "oldest_open_days",
    ):
        assert getattr(row, field) is not None, field
