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
