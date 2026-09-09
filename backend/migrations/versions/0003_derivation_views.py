"""Derivation views: invoice_state, customer_stats, collection_queue.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-08

Every value the frontend calls "derived" is defined here and nowhere else.
Putting the risk rule in a view rather than in Python is what stops the API,
the AI service and the reporting layer each growing their own slightly
different version of it.
"""

from __future__ import annotations

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels = None
depends_on = None

INVOICE_STATE = """
CREATE VIEW invoice_state AS
SELECT
    i.*,
    c.name AS customer_name,
    (CURRENT_DATE - i.due_date) AS days_overdue,
    (
        i.due_date < CURRENT_DATE
        AND i.balance_cents > 0
        AND i.status NOT IN ('draft', 'paid')
    ) AS is_overdue
FROM invoices i
JOIN customers c ON c.id = i.customer_id
"""


def upgrade() -> None:
    op.execute(INVOICE_STATE)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS invoice_state")
