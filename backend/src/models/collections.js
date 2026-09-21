/**
 * Collections. Owns: collection_events, and the collection_queue view.
 *
 * Every query function takes the principal's workspace id as its first
 * argument and builds its statement through the shared scoping helper, so no
 * query reaches a tenant table unscoped.
 */
import { inWorkspace } from "./scope.js";

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
