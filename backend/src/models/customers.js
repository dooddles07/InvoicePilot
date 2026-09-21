/**
 * Customers. Owns: customers, and the customer_stats view.
 *
 * Every query function takes the principal's workspace id as its first
 * argument and builds its statement through the shared scoping helper, so no
 * query reaches a tenant table unscoped.
 */
import { firstOr404, inWorkspace, orderPage } from "./scope.js";

export async function listCustomers(sql, workspaceId, filters) {
  const risk = filters.risk ?? null;
  const search = filters.search ?? null;

  const rows = await sql`
    SELECT c.*, cs.outstanding_cents, cs.overdue_cents, cs.total_invoiced_cents,
           cs.avg_days_to_pay, cs.on_time_rate, cs.open_invoice_count,
           cs.risk, cs.risk_reason, COUNT(*) OVER() AS total
    FROM customers c
    JOIN customer_stats cs
      ON cs.customer_id = c.id AND cs.workspace_id = c.workspace_id
    ${inWorkspace(sql, workspaceId, "c")}
      AND (${risk}::risk_level IS NULL OR cs.risk = ${risk})
      AND (
        ${search}::text IS NULL
        OR c.name ILIKE '%' || ${search} || '%'
        OR c.contact_name ILIKE '%' || ${search} || '%'
        OR c.industry ILIKE '%' || ${search} || '%'
      )
    ${orderPage(sql, filters)}
  `;
  return { data: rows, total: rows[0]?.total ?? 0 };
}

/** Confirms the customer exists in this workspace without paying for the
 *  customer_stats join -- the events and behaviour endpoints need the 404,
 *  not the full customer record. */
export async function assertCustomerExists(sql, workspaceId, customerId) {
  const rows = await sql`
    SELECT id FROM customers ${inWorkspace(sql, workspaceId)} AND id = ${customerId}
  `;
  firstOr404(rows, "Customer");
}

export async function findCustomer(sql, workspaceId, customerId) {
  const rows = await sql`
    SELECT c.*, cs.outstanding_cents, cs.overdue_cents, cs.total_invoiced_cents,
           cs.avg_days_to_pay, cs.on_time_rate, cs.open_invoice_count,
           cs.risk, cs.risk_reason
    FROM customers c
    JOIN customer_stats cs
      ON cs.customer_id = c.id AND cs.workspace_id = c.workspace_id
    ${inWorkspace(sql, workspaceId, "c")} AND c.id = ${customerId}
  `;
  return firstOr404(rows, "Customer");
}

/**
 * Average days beyond terms on settled invoices, by month, last 12 months
 * with data. The inner query orders newest-first to LIMIT correctly; the
 * outer ORDER BY restores chronological order for the chart, which reads
 * left to right.
 */
export async function getCustomerBehaviour(sql, workspaceId, customerId) {
  await assertCustomerExists(sql, workspaceId, customerId);
  return sql`
    SELECT * FROM (
      SELECT
        date_trunc('month', paid_date) AS month,
        ROUND(AVG(paid_date - due_date))::int AS days_beyond_terms
      FROM invoices
      ${inWorkspace(sql, workspaceId)}
        AND customer_id = ${customerId}
        AND status = 'paid'
        AND paid_date IS NOT NULL
      GROUP BY date_trunc('month', paid_date)
      ORDER BY month DESC
      LIMIT 12
    ) months
    ORDER BY month ASC
  `;
}
