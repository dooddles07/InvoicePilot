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
import { randomUUID } from "node:crypto";

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

/**
 * Internal to the write paths in services/invoices.js -- not the API
 * response shape findInvoice above builds, so no items, no nested customer
 * object, but still the full Invoice shape (risk included, joined from
 * customer_stats for the same circularity reason as listInvoices) because
 * every write path either returns this row directly or re-reads through it
 * to answer with something other than a bare UPDATE ... RETURNING *, which
 * has none of invoice_state's derived columns.
 */
export async function findInvoiceForWrite(sql, workspaceId, invoiceId) {
  const rows = await sql`
    SELECT i.*, cs.risk, c.contact_name, c.email AS customer_email
    FROM invoice_state i
    JOIN customer_stats cs
      ON cs.customer_id = i.customer_id AND cs.workspace_id = i.workspace_id
    JOIN customers c ON c.id = i.customer_id AND c.workspace_id = i.workspace_id
    ${inWorkspace(sql, workspaceId, "i")} AND i.id = ${invoiceId}
  `;
  return firstOr404(rows, "Invoice");
}

/** Sequential per workspace, not per year -- COUNT(*) is good enough at demo
 *  scale and a collision is caught by uq_invoices_workspace_number anyway.
 *  ponytail: racy under concurrent creates in the same workspace; a real
 *  sequence column is the fix if this ever needs more than one writer. */
export async function nextInvoiceNumber(sql, workspaceId, issueDate) {
  const [row] = await sql`
    SELECT COUNT(*)::int AS count FROM invoices WHERE workspace_id = ${workspaceId}
  `;
  const year = new Date(issueDate).getUTCFullYear();
  return `INV-${year}-${String(row.count + 1).padStart(5, "0")}`;
}

/** paid_cents and status move together so no caller can update one without
 *  the other; the CASE threshold is amount_cents, not balance_cents, since
 *  the row being written is what balance_cents (generated) derives from. */
export async function applyPaymentToInvoice(sql, workspaceId, invoiceId, { amountCents, receivedAt }) {
  const rows = await sql`
    UPDATE invoices
    SET paid_cents = paid_cents + ${amountCents},
        status = (CASE WHEN paid_cents + ${amountCents} >= amount_cents THEN 'paid' ELSE 'partially_paid' END)::invoice_status,
        paid_date = CASE WHEN paid_cents + ${amountCents} >= amount_cents THEN ${receivedAt}::date ELSE paid_date END,
        updated_at = now()
    ${inWorkspace(sql, workspaceId)} AND id = ${invoiceId}
    RETURNING *
  `;
  return firstOr404(rows, "Invoice");
}

export async function insertInvoice(sql, workspaceId, { id, number, customerId, status, amountCents, issueDate, dueDate, poNumber, notes, sentAt }) {
  const [row] = await sql`
    INSERT INTO invoices (
      id, workspace_id, number, customer_id, status, amount_cents,
      issue_date, due_date, po_number, notes, sent_at
    ) VALUES (
      ${id}, ${workspaceId}, ${number}, ${customerId}, ${status}, ${amountCents},
      ${issueDate}, ${dueDate}, ${poNumber}, ${notes}, ${sentAt}
    )
    RETURNING *
  `;
  return row;
}

// Items arrive already snake_case, straight from the parsed request body
// (services/invoices.js passes body.items through unchanged) -- unlike
// insertPayment/insertCollectionEvent, there is no camelCase call site to
// match here.
export async function insertInvoiceItems(sql, workspaceId, invoiceId, items) {
  return sql`
    INSERT INTO invoice_items ${sql(
      items.map((item) => ({
        id: randomUUID(),
        workspace_id: workspaceId,
        invoice_id: invoiceId,
        description: item.description,
        quantity: item.quantity,
        unit_price_cents: item.unit_price_cents,
        amount_cents: item.quantity * item.unit_price_cents,
      })),
    )}
    RETURNING *
  `;
}

/** balance_cents is generated and so never appears in `fields`; the
 *  ck_invoices_paid_within_amount / due_after_issue constraints are the
 *  backstop for whatever this doesn't validate itself. Keys are column
 *  names verbatim -- postgres.js's SET helper, not a hand-built clause. */
export async function updateInvoiceFields(sql, workspaceId, invoiceId, fields) {
  const rows = await sql`
    UPDATE invoices SET ${sql(fields)}, updated_at = now()
    ${inWorkspace(sql, workspaceId)} AND id = ${invoiceId}
    RETURNING *
  `;
  return firstOr404(rows, "Invoice");
}
