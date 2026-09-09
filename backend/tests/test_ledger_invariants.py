"""The seven invariants ported from src/lib/data/verify.ts.

These are the most valuable logic in the original mockup: the aggregation is
what every screen displays, and when it drifts every screen lies in a
plausible-looking way.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.seeds.demo import seed_demo_workspace


@pytest.fixture(scope="module")
def seeded(engine):
    """One seeded workspace, shared by every invariant test."""
    from sqlalchemy.orm import Session as RawSession

    connection = engine.connect()
    transaction = connection.begin()
    session = RawSession(bind=connection, join_transaction_mode="create_savepoint")
    workspace_id = seed_demo_workspace(session, owner_email="demo@example.com")
    session.flush()

    yield session, workspace_id

    session.close()
    transaction.rollback()
    connection.close()


def test_amounts_are_positive_integers(seeded) -> None:
    session, ws = seeded
    bad = session.scalar(
        text(
            "SELECT COUNT(*) FROM invoices "
            "WHERE workspace_id = :ws AND amount_cents <= 0"
        ),
        {"ws": ws},
    )
    assert bad == 0


def test_balance_is_within_zero_and_amount(seeded) -> None:
    session, ws = seeded
    bad = session.scalar(
        text(
            "SELECT COUNT(*) FROM invoices WHERE workspace_id = :ws "
            "AND (balance_cents < 0 OR balance_cents > amount_cents)"
        ),
        {"ws": ws},
    )
    assert bad == 0


def test_line_items_sum_to_the_invoice_total(seeded) -> None:
    session, ws = seeded
    mismatched = session.scalar(
        text(
            "SELECT COUNT(*) FROM ("
            "  SELECT i.id FROM invoices i"
            "  JOIN invoice_items it ON it.invoice_id = i.id"
            "  WHERE i.workspace_id = :ws"
            "  GROUP BY i.id, i.amount_cents"
            "  HAVING SUM(it.amount_cents) <> i.amount_cents"
            ") q"
        ),
        {"ws": ws},
    )
    assert mismatched == 0


def test_a_paid_invoice_carries_no_balance(seeded) -> None:
    session, ws = seeded
    bad = session.scalar(
        text(
            "SELECT COUNT(*) FROM invoices WHERE workspace_id = :ws "
            "AND status = 'paid' AND balance_cents <> 0"
        ),
        {"ws": ws},
    )
    assert bad == 0


def test_a_paid_date_implies_paid_status(seeded) -> None:
    session, ws = seeded
    bad = session.scalar(
        text(
            "SELECT COUNT(*) FROM invoices WHERE workspace_id = :ws "
            "AND paid_date IS NOT NULL AND status <> 'paid'"
        ),
        {"ws": ws},
    )
    assert bad == 0


def test_aging_buckets_partition_the_open_ledger_exactly_once(seeded) -> None:
    session, ws = seeded
    row = session.execute(
        text(
            "WITH open_rows AS ("
            "  SELECT balance_cents, days_overdue FROM invoice_state"
            "  WHERE workspace_id = :ws AND status NOT IN ('draft', 'paid')"
            "),"
            "bucketed AS ("
            "  SELECT balance_cents, CASE"
            "    WHEN days_overdue <= 0 THEN 'current'"
            "    WHEN days_overdue <= 30 THEN '1_30'"
            "    WHEN days_overdue <= 60 THEN '31_60'"
            "    WHEN days_overdue <= 90 THEN '61_90'"
            "    ELSE '90_plus' END AS bucket"
            "  FROM open_rows"
            ")"
            "SELECT"
            "  (SELECT COALESCE(SUM(balance_cents), 0) FROM open_rows) AS open_total,"
            "  (SELECT COALESCE(SUM(balance_cents), 0) FROM bucketed) AS bucket_total,"
            "  (SELECT COUNT(*) FROM open_rows) AS open_count,"
            "  (SELECT COUNT(*) FROM bucketed) AS bucket_count"
        ),
        {"ws": ws},
    ).one()
    assert row.bucket_total == row.open_total
    assert row.bucket_count == row.open_count


def test_the_ledger_has_a_spread_across_every_aging_bucket(seeded) -> None:
    # A collections product whose demo data is all 'current' demonstrates
    # nothing. This is what the delinquency horizon in the generator is for.
    session, ws = seeded
    buckets = session.scalars(
        text(
            "SELECT DISTINCT CASE"
            "  WHEN days_overdue <= 0 THEN 'current'"
            "  WHEN days_overdue <= 30 THEN '1_30'"
            "  WHEN days_overdue <= 60 THEN '31_60'"
            "  WHEN days_overdue <= 90 THEN '61_90'"
            "  ELSE '90_plus' END"
            " FROM invoice_state WHERE workspace_id = :ws"
            " AND status NOT IN ('draft', 'paid')"
        ),
        {"ws": ws},
    ).all()
    assert set(buckets) == {"current", "1_30", "31_60", "61_90", "90_plus"}


def test_payments_reconcile_with_invoice_paid_amounts(seeded) -> None:
    session, ws = seeded
    mismatched = session.scalar(
        text(
            "SELECT COUNT(*) FROM ("
            "  SELECT i.id FROM invoices i"
            "  LEFT JOIN payments p ON p.invoice_id = i.id"
            "  WHERE i.workspace_id = :ws"
            "  GROUP BY i.id, i.paid_cents"
            "  HAVING COALESCE(SUM(p.amount_cents), 0) <> i.paid_cents"
            ") q"
        ),
        {"ws": ws},
    )
    assert mismatched == 0
