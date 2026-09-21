/**
 * Payments. Owns: payments.
 *
 * Every query function takes the principal's workspace id as its first
 * argument and builds its statement through the shared scoping helper, so no
 * query reaches a tenant table unscoped.
 */
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
