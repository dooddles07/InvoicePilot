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


CUSTOMER_STATS = """
CREATE VIEW customer_stats AS
WITH settled AS (
    SELECT
        customer_id,
        AVG(paid_date - issue_date)::numeric        AS avg_days_to_pay,
        AVG((paid_date <= due_date)::int) * 100     AS on_time_rate,
        COUNT(*)                                    AS settled_count
    FROM invoices
    WHERE status = 'paid' AND paid_date IS NOT NULL
    GROUP BY customer_id
),
open_now AS (
    SELECT
        customer_id,
        SUM(balance_cents)                              AS outstanding_cents,
        COALESCE(SUM(balance_cents) FILTER (WHERE is_overdue), 0)
                                                        AS overdue_cents,
        COUNT(*)                                        AS open_invoice_count,
        COALESCE(MAX(days_overdue) FILTER (WHERE is_overdue), 0)
                                                        AS oldest_open_days
    FROM invoice_state
    WHERE status NOT IN ('draft', 'paid')
    GROUP BY customer_id
),
totals AS (
    SELECT customer_id, SUM(amount_cents) AS total_invoiced_cents
    FROM invoices
    WHERE status <> 'draft'
    GROUP BY customer_id
)
SELECT
    c.id                                        AS customer_id,
    c.workspace_id,
    COALESCE(o.outstanding_cents, 0)::bigint    AS outstanding_cents,
    COALESCE(o.overdue_cents, 0)::bigint        AS overdue_cents,
    COALESCE(t.total_invoiced_cents, 0)::bigint AS total_invoiced_cents,
    COALESCE(ROUND(s.avg_days_to_pay), 0)::int  AS avg_days_to_pay,
    COALESCE(ROUND(s.on_time_rate), 0)::int     AS on_time_rate,
    COALESCE(o.open_invoice_count, 0)::int      AS open_invoice_count,
    COALESCE(o.oldest_open_days, 0)::int        AS oldest_open_days,
    CAST(
        CASE
            WHEN COALESCE(s.settled_count, 0) > 0 AND s.on_time_rate < 40
                THEN 'high'
            WHEN COALESCE(o.oldest_open_days, 0) > 60 THEN 'high'
            WHEN COALESCE(s.settled_count, 0) > 0 AND s.on_time_rate < 75
                THEN 'medium'
            WHEN COALESCE(o.oldest_open_days, 0) > 14 THEN 'medium'
            WHEN COALESCE(s.settled_count, 0) > 0
                 AND s.avg_days_to_pay > c.payment_terms_days + 7 THEN 'medium'
            ELSE 'low'
        END
    AS risk_level)                              AS risk,
    -- The reason travels with the grade. A risk score a finance manager cannot
    -- explain to a customer is a score they will not act on.
    CASE
        WHEN COALESCE(s.settled_count, 0) > 0 AND s.on_time_rate < 40
            THEN 'Settles on time only ' || ROUND(s.on_time_rate) || '% of the time'
        WHEN COALESCE(o.oldest_open_days, 0) > 60
            THEN 'Carrying a balance ' || o.oldest_open_days || ' days past due'
        WHEN COALESCE(s.settled_count, 0) > 0 AND s.on_time_rate < 75
            THEN 'On-time rate has fallen to ' || ROUND(s.on_time_rate) || '%'
        WHEN COALESCE(o.oldest_open_days, 0) > 14
            THEN 'Balance is ' || o.oldest_open_days || ' days past terms'
        WHEN COALESCE(s.settled_count, 0) > 0
             AND s.avg_days_to_pay > c.payment_terms_days + 7
            THEN 'Averages ' || ROUND(s.avg_days_to_pay) || ' days against '
                 || c.payment_terms_days || '-day terms'
        WHEN COALESCE(s.settled_count, 0) = 0
             AND COALESCE(o.open_invoice_count, 0) = 0
            THEN 'No payment history yet'
        ELSE 'Pays on terms'
    END                                         AS risk_reason
FROM customers c
LEFT JOIN settled  s ON s.customer_id = c.id
LEFT JOIN open_now o ON o.customer_id = c.id
LEFT JOIN totals   t ON t.customer_id = c.id
"""


COLLECTION_QUEUE = """
CREATE VIEW collection_queue AS
SELECT *
FROM (
    SELECT DISTINCT ON (i.workspace_id, i.customer_id)
        i.id                AS invoice_id,
        i.workspace_id,
        i.customer_id,
        i.number,
        i.customer_name,
        i.balance_cents,
        i.days_overdue,
        cs.risk,
        (
            i.balance_cents
            * CASE cs.risk
                WHEN 'high'   THEN 2.4
                WHEN 'medium' THEN 1.6
                ELSE 1.0
              END
            * EXP(-i.days_overdue / 55.0)
        ) AS recovery_score
    FROM invoice_state i
    JOIN customer_stats cs ON cs.customer_id = i.customer_id
    WHERE i.is_overdue
    ORDER BY i.workspace_id, i.customer_id, recovery_score DESC
) q
ORDER BY q.workspace_id, q.recovery_score DESC
"""


def upgrade() -> None:
    op.execute(INVOICE_STATE)
    op.execute(CUSTOMER_STATS)
    op.execute(COLLECTION_QUEUE)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS collection_queue")
    op.execute("DROP VIEW IF EXISTS customer_stats")
    op.execute("DROP VIEW IF EXISTS invoice_state")
