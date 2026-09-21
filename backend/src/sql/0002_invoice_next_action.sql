-- Appends next_action to invoice_state. CREATE OR REPLACE VIEW only permits
-- adding trailing columns, which is exactly what this needs: everything above
-- next_action is unchanged from 0001, so customer_stats and collection_queue
-- (which both select explicit columns, never invoice_state.*) are unaffected.
--
-- Lives in the view rather than in application code for the same reason
-- risk and is_overdue do: 0001_derivation_views.sql says every derived value
-- is defined here and nowhere else, so the API, the AI service and the
-- reporting layer cannot grow three slightly different versions of it.

CREATE OR REPLACE VIEW invoice_state AS
SELECT
    i.*,
    c.name AS customer_name,
    (CURRENT_DATE - i.due_date) AS days_overdue,
    (
        i.due_date < CURRENT_DATE
        AND i.balance_cents > 0
        AND i.status NOT IN ('draft', 'paid')
    ) AS is_overdue,
    CASE
        WHEN i.status IN ('draft', 'paid') THEN NULL
        WHEN i.status = 'disputed' THEN 'Resolve the dispute'
        WHEN CURRENT_DATE - i.due_date > 45 THEN 'Call the account'
        WHEN CURRENT_DATE - i.due_date > 10 THEN 'Send a firm reminder'
        WHEN CURRENT_DATE - i.due_date > 0 THEN 'Send a friendly reminder'
        ELSE NULL
    END AS next_action
FROM invoices i
JOIN customers c ON c.id = i.customer_id;
