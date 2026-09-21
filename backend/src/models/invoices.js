/**
 * Invoices. Owns: invoices, invoice_items, and the invoice_state view.
 *
 * risk joins in from customer_stats rather than living in invoice_state:
 * customer_stats itself reads FROM invoice_state, so extending invoice_state
 * with a customer_stats join would make the two views mutually recursive.
 * The join condition scopes both sides on workspace_id, not just the outer
 * one -- a join qualified on only one side is how a tenancy leak gets
 * written.
 */
import { firstOr404, inWorkspace, orderPage } from "./scope.js";

export async function listInvoices(sql, workspaceId, filters) {
  const status = filters.status ?? null;
  const risk = filters.risk ?? null;
  const customerId = filters.customer_id ?? null;
  const overdue = filters.overdue ?? null;
  const search = filters.search ?? null;

  const rows = await sql`
    SELECT i.*, cs.risk, COUNT(*) OVER() AS total
    FROM invoice_state i
    JOIN customer_stats cs
      ON cs.customer_id = i.customer_id AND cs.workspace_id = i.workspace_id
    ${inWorkspace(sql, workspaceId, "i")}
      AND (${status}::invoice_status IS NULL OR i.status = ${status})
      AND (${risk}::risk_level IS NULL OR cs.risk = ${risk})
      AND (${customerId}::uuid IS NULL OR i.customer_id = ${customerId})
      AND (${overdue}::boolean IS NULL OR i.is_overdue = ${overdue})
      AND (
        ${search}::text IS NULL
        OR i.number ILIKE '%' || ${search} || '%'
        OR i.customer_name ILIKE '%' || ${search} || '%'
      )
    ${orderPage(sql, filters)}
  `;
  // `total` rides along on every row (COUNT(*) OVER() has nowhere else to
  // go); left in place rather than stripped, since the Zod schema on the
  // other end already ignores fields it doesn't declare.
  return { data: rows, total: rows[0]?.total ?? 0 };
}

/** Confirms the invoice exists in this workspace without paying for its line
 *  items -- the events endpoint needs the 404, not the invoice itself. */
export async function assertInvoiceExists(sql, workspaceId, invoiceId) {
  const rows = await sql`
    SELECT id FROM invoices ${inWorkspace(sql, workspaceId)} AND id = ${invoiceId}
  `;
  firstOr404(rows, "Invoice");
}

export async function findInvoiceItems(sql, workspaceId, invoiceId) {
  return sql`
    SELECT id, description, quantity, unit_price_cents, amount_cents
    FROM invoice_items
    ${inWorkspace(sql, workspaceId)} AND invoice_id = ${invoiceId}
    ORDER BY created_at
  `;
}

/**
 * The detail response also carries the customer context the page renders
 * alongside the invoice -- outstanding balance, on-time rate, contact info.
 * Customers has no endpoint yet, so this embeds it from the same
 * customer_stats join the invoice's own risk already comes from, plus one
 * more join for the raw contact columns customer_stats does not carry.
 */
export async function findInvoice(sql, workspaceId, invoiceId) {
  const rows = await sql`
    SELECT
      i.*, cs.risk,
      c.contact_name, c.email, c.phone, c.payment_terms_days,
      cs.outstanding_cents, cs.on_time_rate, cs.avg_days_to_pay, cs.open_invoice_count
    FROM invoice_state i
    JOIN customer_stats cs
      ON cs.customer_id = i.customer_id AND cs.workspace_id = i.workspace_id
    JOIN customers c
      ON c.id = i.customer_id AND c.workspace_id = i.workspace_id
    ${inWorkspace(sql, workspaceId, "i")} AND i.id = ${invoiceId}
  `;
  const row = firstOr404(rows, "Invoice");
  const items = await findInvoiceItems(sql, workspaceId, invoiceId);
  const {
    contact_name,
    email,
    phone,
    payment_terms_days,
    outstanding_cents,
    on_time_rate,
    avg_days_to_pay,
    open_invoice_count,
    ...invoice
  } = row;

  return {
    ...invoice,
    items,
    customer: {
      id: invoice.customer_id,
      name: invoice.customer_name,
      contact_name,
      email,
      phone,
      payment_terms_days,
      outstanding_cents,
      on_time_rate,
      avg_days_to_pay,
      open_invoice_count,
      risk: invoice.risk,
    },
  };
}
