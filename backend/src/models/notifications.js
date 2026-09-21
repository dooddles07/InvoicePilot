/**
 * Notifications. Owns: communication_logs, email_templates.
 *
 * The templates are seeded per workspace at signup so the first reminder has
 * copy to send. An empty template table means the send path has to invent one.
 * Placeholders are the tokens the reminder service substitutes.
 *
 * Ported from the TEMPLATES tuple in app/services/auth.py.
 */
import { randomUUID } from "node:crypto";

import { firstOr404, inWorkspace } from "./scope.js";

export const REMINDER_TEMPLATES = Object.freeze([
  Object.freeze({
    name: "Friendly nudge",
    tone: "friendly",
    subject: "A quick note about invoice {invoice_number}",
    body:
      "Hi {contact_name},\n\nInvoice {invoice_number} for {amount} was due on " +
      "{due_date}. If it is already on its way, thank you -- please ignore " +
      "this note.\n\n{payment_link}\n\nBest,\n{sender_name}",
  }),
  Object.freeze({
    name: "Firm reminder",
    tone: "firm",
    subject: "Invoice {invoice_number} is {days_overdue} days overdue",
    body:
      "Hi {contact_name},\n\nInvoice {invoice_number} for {amount} was due on " +
      "{due_date} and is now {days_overdue} days overdue. Could you confirm " +
      "when we can expect payment?\n\n{payment_link}\n\nThanks,\n{sender_name}",
  }),
  Object.freeze({
    name: "Final notice",
    tone: "final",
    subject: "Final notice: invoice {invoice_number}",
    body:
      "Hi {contact_name},\n\nInvoice {invoice_number} for {amount} remains " +
      "unpaid {days_overdue} days after its due date. Please arrange payment " +
      "within five business days so we can keep your account in good " +
      "standing.\n\n{payment_link}\n\nRegards,\n{sender_name}",
  }),
]);

export async function insertEmailTemplates(sql, workspaceId) {
  await sql`
    INSERT INTO email_templates ${sql(
      REMINDER_TEMPLATES.map((template) => ({
        id: randomUUID(),
        workspace_id: workspaceId,
        name: template.name,
        tone: template.tone,
        subject: template.subject,
        body: template.body,
      })),
    )}
  `;
}

/** Every workspace gets all three tones at signup (insertEmailTemplates
 *  above), so a missing row means a workspace older than that guarantee --
 *  404 rather than inventing copy on the fly. */
export async function findEmailTemplate(sql, workspaceId, tone) {
  const rows = await sql`
    SELECT * FROM email_templates ${inWorkspace(sql, workspaceId)} AND tone = ${tone}
  `;
  return firstOr404(rows, "Email template");
}

/**
 * The whole idempotency mechanism lives in this one INSERT: a double-clicked
 * send retries with the same idempotency_key, collides with
 * uq_communication_logs_workspace_key, and DO NOTHING means no row comes
 * back. The caller is what tells a fresh send (row returned, go call Resend)
 * from a replay (nothing returned, go re-fetch and hand back what already
 * happened) -- this function does not guess which one it was asked for.
 */
export async function insertCommunicationLogIfNew(sql, workspaceId, row) {
  const rows = await sql`
    INSERT INTO communication_logs (
      id, workspace_id, invoice_id, customer_id, channel, to_address,
      subject, body, status, idempotency_key, queued_at
    ) VALUES (
      ${randomUUID()}, ${workspaceId}, ${row.invoiceId}, ${row.customerId}, 'email',
      ${row.toAddress}, ${row.subject}, ${row.body}, 'queued',
      ${row.idempotencyKey}, now()
    )
    ON CONFLICT ON CONSTRAINT uq_communication_logs_workspace_key DO NOTHING
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function findCommunicationLogByKey(sql, workspaceId, idempotencyKey) {
  const rows = await sql`
    SELECT * FROM communication_logs
    ${inWorkspace(sql, workspaceId)} AND idempotency_key = ${idempotencyKey}
  `;
  return firstOr404(rows, "Communication log");
}

export async function markCommunicationLogDelivered(sql, id, { sent, providerMessageId, error }) {
  const [row] = await sql`
    UPDATE communication_logs
    SET status = ${sent ? "sent" : "failed"},
        sent_at = ${sent ? sql`now()` : null},
        provider_message_id = ${providerMessageId},
        error = ${error},
        updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return row;
}
