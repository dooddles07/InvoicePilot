/**
 * Row builders shared by every test file.
 *
 * Invoices are described in offsets from today ("due 40 days ago") rather than
 * in literal dates, because every derived value in the views is a function of
 * CURRENT_DATE. A fixture pinned to a literal date starts failing on its own
 * the following morning.
 */

export async function makeWorkspace(tx) {
  const rows = await tx`
    INSERT INTO workspaces (id, name, slug)
    VALUES (
      gen_random_uuid(), 'Test Workspace',
      'test-' || substr(gen_random_uuid()::text, 1, 8)
    )
    RETURNING id
  `;
  return rows[0].id;
}

export async function makeCustomer(tx, workspaceId, options) {
  const terms = options.terms ?? 30;
  const rows = await tx`
    INSERT INTO customers (
      id, workspace_id, name, contact_name, email,
      payment_terms_days, customer_since
    ) VALUES (
      gen_random_uuid(), ${workspaceId}, ${options.name},
      ${`Contact for ${options.name}`},
      -- Unique per row: customers are unique on (workspace_id, email).
      gen_random_uuid()::text || '@example.test',
      ${terms}, CURRENT_DATE - 365
    )
    RETURNING id
  `;
  return rows[0].id;
}

export async function makeInvoice(tx, workspaceId, customerId, options) {
  const due = options.dueOffsetDays ?? 30;
  // Defaults to thirty days before the due date so the due_date >= issue_date
  // check always holds.
  const issue = options.issueOffsetDays ?? due - 30;
  const paidOffset = options.paidOffsetDays ?? null;
  const rows = await tx`
    INSERT INTO invoices (
      id, workspace_id, number, customer_id, status,
      amount_cents, paid_cents, issue_date, due_date, paid_date
    ) VALUES (
      gen_random_uuid(), ${workspaceId},
      -- Unique per row: invoices are unique on (workspace_id, number).
      'INV-' || substr(gen_random_uuid()::text, 1, 12),
      ${customerId},
      CAST(${options.status ?? "sent"} AS invoice_status),
      ${options.amount}, ${options.paid ?? 0},
      CURRENT_DATE + CAST(${issue} AS integer),
      CURRENT_DATE + CAST(${due} AS integer),
      ${
        paidOffset === null
          ? tx`NULL::date`
          : tx`CURRENT_DATE + CAST(${paidOffset} AS integer)`
      }
    )
    RETURNING id
  `;
  return rows[0].id;
}
