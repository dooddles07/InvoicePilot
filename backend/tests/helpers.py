"""Row builders shared by every test file.

Tests describe invoices in offsets from today ("due 40 days ago") rather than
in literal dates, because every derived value in this plan is a function of
``CURRENT_DATE``. A fixture pinned to a literal date starts failing on its own
the following morning.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session


def make_customer(
    db: Session,
    workspace_id: uuid.UUID,
    *,
    name: str,
    terms: int = 30,
) -> uuid.UUID:
    customer_id = uuid.uuid4()
    db.execute(
        text(
            """
            INSERT INTO customers (
                id, workspace_id, name, contact_name, email,
                payment_terms_days, customer_since
            ) VALUES (
                :id, :workspace_id, :name, :contact, :email,
                :terms, CURRENT_DATE - 365
            )
            """
        ),
        {
            "id": customer_id,
            "workspace_id": workspace_id,
            "name": name,
            "contact": f"Contact for {name}",
            # Unique per row: customers are unique on (workspace_id, email).
            "email": f"{customer_id}@example.test",
            "terms": terms,
        },
    )
    return customer_id


def make_invoice(
    db: Session,
    workspace_id: uuid.UUID,
    customer_id: uuid.UUID,
    *,
    amount: int,
    paid: int = 0,
    due_offset_days: int = 30,
    issue_offset_days: int | None = None,
    paid_offset_days: int | None = None,
    status: str = "sent",
) -> uuid.UUID:
    """Insert one invoice.

    Offsets are relative to today and count forward: ``due_offset_days=-40``
    means due forty days ago. ``issue_offset_days`` defaults to thirty days
    before the due date so the ``due_date >= issue_date`` check always holds.
    """

    invoice_id = uuid.uuid4()
    if issue_offset_days is None:
        issue_offset_days = due_offset_days - 30
    paid_date = (
        date.today() + timedelta(days=paid_offset_days)
        if paid_offset_days is not None
        else None
    )
    db.execute(
        text(
            """
            INSERT INTO invoices (
                id, workspace_id, number, customer_id, status,
                amount_cents, paid_cents, issue_date, due_date, paid_date
            ) VALUES (
                :id, :workspace_id, :number, :customer_id,
                CAST(:status AS invoice_status),
                :amount, :paid,
                CURRENT_DATE + CAST(:issue AS integer),
                CURRENT_DATE + CAST(:due AS integer),
                :paid_date
            )
            """
        ),
        {
            "id": invoice_id,
            "workspace_id": workspace_id,
            # Unique per row: invoices are unique on (workspace_id, number).
            "number": f"INV-{invoice_id.hex[:12]}",
            "customer_id": customer_id,
            "status": status,
            "amount": amount,
            "paid": paid,
            "issue": issue_offset_days,
            "due": due_offset_days,
            "paid_date": paid_date,
        },
    )
    return invoice_id


def utc(*, days_ago: int = 0) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days_ago)
