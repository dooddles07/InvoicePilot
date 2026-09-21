/**
 * Collections. Owns: collection_events, and the collection_queue view.
 *
 * Every query function takes the principal's workspace id as its first
 * argument and builds its statement through the shared scoping helper, so no
 * query reaches a tenant table unscoped.
 */
import { inWorkspace } from "./scope.js";

/**
 * Every open invoice, tagged with the pipeline stage it belongs in. A flat,
 * complete list rather than five separate queries: the board groups client
 * side, the same way the fixture ledger's getPipeline() always did -- stage
 * labels and column order are UI config, not something the API should own.
 *
 * risk joins in exactly as it does for the plain invoice list, for the same
 * circularity reason: invoice_state cannot join customer_stats itself.
 */
export async function listPipeline(sql, workspaceId) {
  return sql`
    SELECT i.*, cs.risk,
      CASE
        WHEN i.days_overdue < 0 THEN 'upcoming'
        WHEN i.days_overdue = 0 THEN 'due_today'
        WHEN i.days_overdue BETWEEN 1 AND 30 THEN 'late_1_30'
        WHEN i.days_overdue BETWEEN 31 AND 60 THEN 'late_31_60'
        ELSE 'late_60_plus'
      END AS stage
    FROM invoice_state i
    JOIN customer_stats cs
      ON cs.customer_id = i.customer_id AND cs.workspace_id = i.workspace_id
    ${inWorkspace(sql, workspaceId, "i")} AND i.status NOT IN ('draft', 'paid')
    ORDER BY
      CASE
        WHEN i.days_overdue < 0 THEN 0
        WHEN i.days_overdue = 0 THEN 1
        WHEN i.days_overdue BETWEEN 1 AND 30 THEN 2
        WHEN i.days_overdue BETWEEN 31 AND 60 THEN 3
        ELSE 4
      END,
      i.balance_cents DESC
  `;
}

/**
 * The recovery-ranked queue: collection_queue's one row per customer, joined
 * back out to the fields aiNoteFor (services/collections.js) needs but the
 * view does not carry -- status and last_contacted_at from invoice_state,
 * on_time_rate and avg_days_to_pay from customer_stats, contact_name and
 * payment_terms_days from customers. Not listOf(): a fixed-size ranked
 * digest, not something a caller pages through.
 */
export async function listQueue(sql, workspaceId, limit) {
  return sql`
    SELECT
      q.invoice_id, q.customer_id, q.number, q.customer_name, q.balance_cents,
      q.days_overdue, q.risk,
      i.status, i.next_action, i.last_contacted_at,
      (CURRENT_DATE - i.last_contacted_at::date) AS days_since_contact,
      cs.on_time_rate, cs.avg_days_to_pay,
      c.contact_name, c.payment_terms_days
    FROM collection_queue q
    JOIN invoice_state i ON i.id = q.invoice_id AND i.workspace_id = q.workspace_id
    JOIN customer_stats cs
      ON cs.customer_id = q.customer_id AND cs.workspace_id = q.workspace_id
    JOIN customers c ON c.id = q.customer_id AND c.workspace_id = q.workspace_id
    WHERE q.workspace_id = ${workspaceId}
    ORDER BY q.recovery_score DESC
    LIMIT ${limit}
  `;
}

/** Called from the invoices controller, not its own route: an invoice's
 *  timeline is collection_events filtered by invoice_id, and the caller has
 *  already confirmed the invoice exists in this workspace. */
export async function listInvoiceEvents(sql, workspaceId, invoiceId) {
  return sql`
    SELECT id, workspace_id, invoice_id, customer_id, type, channel,
           summary, detail, actor, occurred_at
    FROM collection_events
    ${inWorkspace(sql, workspaceId)} AND invoice_id = ${invoiceId}
    ORDER BY occurred_at DESC
  `;
}

/** Called from the customers controller, not its own route, the same way
 *  listInvoiceEvents is. Capped at 20: a customer accumulates events across
 *  every invoice it has ever had, unlike one invoice's own bounded history. */
export async function listCustomerEvents(sql, workspaceId, customerId) {
  return sql`
    SELECT id, workspace_id, invoice_id, customer_id, type, channel,
           summary, detail, actor, occurred_at
    FROM collection_events
    ${inWorkspace(sql, workspaceId)} AND customer_id = ${customerId}
    ORDER BY occurred_at DESC
    LIMIT 20
  `;
}
