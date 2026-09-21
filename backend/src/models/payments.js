/**
 * Payments. Owns: payments.
 *
 * Every query function takes the principal's workspace id as its first
 * argument and builds its statement through the shared scoping helper, so no
 * query reaches a tenant table unscoped.
 */
import { randomUUID } from "node:crypto";

import { inWorkspace, orderPage } from "./scope.js";

/**
 * invoice_number and customer_name are denormalized here the same way
 * invoice_state denormalizes customer_name onto invoices: the payments table
 * itself carries only the ids.
 */
export async function listPayments(sql, workspaceId, filters) {
  const rows = await sql`
    SELECT p.*, i.number AS invoice_number, c.name AS customer_name,
           COUNT(*) OVER() AS total
    FROM payments p
    JOIN invoices i ON i.id = p.invoice_id AND i.workspace_id = p.workspace_id
    JOIN customers c ON c.id = p.customer_id AND c.workspace_id = p.workspace_id
    ${inWorkspace(sql, workspaceId, "p")}
    ${orderPage(sql, filters, "p")}
  `;
  return { data: rows, total: rows[0]?.total ?? 0 };
}

/** invoice_id and customer_id both come from the invoice the service already
 *  loaded and scoped -- never from the request body -- so a payment cannot
 *  be attached to another workspace's invoice by id-guessing. */
export async function insertPayment(sql, workspaceId, { invoiceId, customerId, amountCents, method, reference, receivedAt }) {
  const [row] = await sql`
    INSERT INTO payments (
      id, workspace_id, invoice_id, customer_id, amount_cents, method, reference, received_at
    ) VALUES (
      ${randomUUID()}, ${workspaceId}, ${invoiceId}, ${customerId},
      ${amountCents}, ${method}, ${reference}, ${receivedAt}
    )
    RETURNING *
  `;
  return row;
}
