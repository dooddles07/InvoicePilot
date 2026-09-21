/**
 * Invoices: the write paths. Reads live in models/invoices.js and need no
 * service, per spec decision 7 -- everything here is a multi-statement use
 * case (payment application, creation, a send that logs before it delivers).
 *
 * Every exported function opens its own `transaction()` (db/index.js), which
 * is `sql.begin` outside a test and `sql.savepoint` inside one -- see that
 * function's comment. sendInvoiceEmail is the one exception: its network
 * call to Resend sits deliberately outside any transaction, between the
 * queued-row insert and the transaction that records the outcome, because a
 * held DB transaction has no business waiting on an HTTP response.
 */
import { randomUUID } from "node:crypto";

import { transaction } from "../db/index.js";
import { findUserById } from "../models/auth.js";
import * as auditModel from "../models/audit.js";
import * as collectionsModel from "../models/collections.js";
import { findCustomer } from "../models/customers.js";
import * as invoicesModel from "../models/invoices.js";
import * as notificationsModel from "../models/notifications.js";
import * as paymentsModel from "../models/payments.js";
import { Conflict, ValidationFailed } from "../middleware/errors.js";
import { deliverEmail } from "./email.js";
import { dispatchEvent } from "./webhooks.js";

function money(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function renderTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

async function actorLabel(sql, principal) {
  const user = await findUserById(sql, principal.userId);
  return user?.full_name ?? "Someone";
}

export async function recordPayment(sql, workspaceId, principal, body) {
  return transaction(sql, async (tx) => {
    const invoice = await invoicesModel.findInvoiceForWrite(tx, workspaceId, body.invoice_id);
    if (invoice.status === "draft") {
      throw new Conflict("Cannot record a payment on a draft invoice");
    }
    if (invoice.status === "paid") {
      throw new Conflict("This invoice is already paid in full");
    }
    if (body.amount_cents > invoice.balance_cents) {
      throw new ValidationFailed(
        `Amount exceeds the remaining balance of ${money(invoice.balance_cents)}`,
      );
    }

    const payment = await paymentsModel.insertPayment(tx, workspaceId, {
      invoiceId: invoice.id,
      customerId: invoice.customer_id,
      amountCents: body.amount_cents,
      method: body.method,
      reference: body.reference ?? null,
      receivedAt: body.received_at,
    });

    await invoicesModel.applyPaymentToInvoice(tx, workspaceId, invoice.id, {
      amountCents: body.amount_cents,
      receivedAt: body.received_at,
    });

    const actor = await actorLabel(tx, principal);
    await collectionsModel.insertCollectionEvent(tx, workspaceId, {
      invoiceId: invoice.id,
      customerId: invoice.customer_id,
      type: "payment_received",
      channel: "system",
      summary: `Payment of ${money(body.amount_cents)} recorded`,
      detail: payment.reference ? `Reference ${payment.reference}.` : null,
      actor,
      occurredAt: body.received_at,
    });

    await auditModel.insertAuditLog(tx, workspaceId, {
      actorUserId: principal.userId,
      actorLabel: actor,
      action: "payment.recorded",
      targetType: "invoice",
      targetId: invoice.id,
    });

    // A webhook target being unreachable must not fail the payment that was
    // already written -- only the notification about it.
    try {
      await dispatchEvent(tx, workspaceId, "payment.received", {
        invoice_id: invoice.id,
        invoice_number: invoice.number,
        customer_name: invoice.customer_name,
        amount_cents: body.amount_cents,
      });
    } catch {
      // Best-effort: the delivery log already recorded the attempt.
    }

    // Re-read through invoice_state rather than trust applyPaymentToInvoice's
    // RETURNING: that UPDATE runs against the raw invoices table, which has
    // none of risk / is_overdue / days_overdue / customer_name -- fields the
    // response's Invoice shape requires and only the view computes.
    return { payment, invoice: await invoicesModel.findInvoiceForWrite(tx, workspaceId, invoice.id) };
  });
}

export async function createInvoice(sql, workspaceId, principal, body) {
  return transaction(sql, async (tx) => {
    // 404, not the FK's own error: customer_id is caller-supplied, and the
    // foreign key alone would accept another workspace's customer id, since
    // it only checks the row exists somewhere, not that it is scoped here.
    await findCustomer(tx, workspaceId, body.customer_id);

    const amountCents = body.items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price_cents,
      0,
    );
    const id = randomUUID();
    const number = await invoicesModel.nextInvoiceNumber(tx, workspaceId, body.issue_date);

    await invoicesModel.insertInvoice(tx, workspaceId, {
      id,
      number,
      customerId: body.customer_id,
      status: "draft",
      amountCents,
      issueDate: body.issue_date,
      dueDate: body.due_date,
      poNumber: body.po_number ?? null,
      notes: body.notes ?? null,
      sentAt: null,
    });
    await invoicesModel.insertInvoiceItems(tx, workspaceId, id, body.items);

    const actor = await actorLabel(tx, principal);
    await auditModel.insertAuditLog(tx, workspaceId, {
      actorUserId: principal.userId,
      actorLabel: actor,
      action: "invoice.created",
      targetType: "invoice",
      targetId: id,
    });

    return invoicesModel.findInvoice(tx, workspaceId, id);
  });
}

const DISPUTABLE = new Set(["sent", "viewed", "partially_paid"]);

export async function updateInvoice(sql, workspaceId, principal, invoiceId, patch) {
  return transaction(sql, async (tx) => {
    const invoice = await invoicesModel.findInvoiceForWrite(tx, workspaceId, invoiceId);

    if (patch.status === "disputed" && !DISPUTABLE.has(invoice.status)) {
      throw new Conflict(`Cannot dispute an invoice that is ${invoice.status}`);
    }

    const fields = {};
    if (patch.status !== undefined) fields.status = patch.status;
    if (patch.po_number !== undefined) fields.po_number = patch.po_number;
    if (patch.notes !== undefined) fields.notes = patch.notes;
    if (patch.due_date !== undefined) fields.due_date = patch.due_date;

    await invoicesModel.updateInvoiceFields(tx, workspaceId, invoiceId, fields);
    const actor = await actorLabel(tx, principal);

    if (patch.status === "disputed" && invoice.status !== "disputed") {
      await collectionsModel.insertCollectionEvent(tx, workspaceId, {
        invoiceId,
        customerId: invoice.customer_id,
        type: "dispute_raised",
        channel: null,
        summary: `${invoice.number} marked as disputed`,
        detail: null,
        actor,
        occurredAt: new Date(),
      });
    }

    await auditModel.insertAuditLog(tx, workspaceId, {
      actorUserId: principal.userId,
      actorLabel: actor,
      action: "invoice.updated",
      targetType: "invoice",
      targetId: invoiceId,
    });

    return invoicesModel.findInvoiceForWrite(tx, workspaceId, invoiceId);
  });
}

const UNSENDABLE = {
  paid: "This invoice is already paid",
  disputed: "Resolve the dispute before sending a reminder",
};

/**
 * The one path that writes communication_logs, called from both
 * POST /invoices/:id/send and POST /collections/reminders -- a reminder is
 * not a different kind of email, just a later one on an invoice that was
 * already sent. idempotencyKey is caller-supplied (not generated here) so a
 * retried request with the same key collides instead of sending twice.
 */
export async function sendInvoiceEmail(sql, config, workspaceId, principal, invoiceId, { tone, idempotencyKey, subjectOverride, bodyOverride, actorOverride }) {
  const invoice = await invoicesModel.findInvoiceForWrite(sql, workspaceId, invoiceId);
  if (UNSENDABLE[invoice.status]) throw new Conflict(UNSENDABLE[invoice.status]);

  // The daily automation evaluator has no human principal to name -- it
  // passes its own automation's name instead, which is also what
  // services/automations.js's recovered_cents_30d attribution joins on.
  const actor = actorOverride ?? (await actorLabel(sql, principal));
  const wasFirstSend = invoice.status === "draft";

  // The dialog drafts from a template and lets a person edit it before it
  // goes out -- "AI recommendation -> human confirmation -> action" (the
  // same rule SendReminderDialog's own comment names). An edited draft is
  // what actually sends; the template still renders the confirmation-free
  // path (creation's "send now" and any caller with no draft of its own).
  let subject = subjectOverride;
  let html = bodyOverride?.replace(/\n/g, "<br>");
  if (!subject || !html) {
    const template = await notificationsModel.findEmailTemplate(sql, workspaceId, tone);
    const vars = {
      contact_name: invoice.contact_name,
      invoice_number: invoice.number,
      amount: money(invoice.balance_cents),
      due_date: invoice.due_date,
      days_overdue: String(Math.max(0, invoice.days_overdue)),
      payment_link: `https://invoicepilot-three.vercel.app/invoices/${invoice.id}`,
      sender_name: actor,
    };
    subject ??= renderTemplate(template.subject, vars);
    html ??= renderTemplate(template.body, vars).replace(/\n/g, "<br>");
  }

  const logged = await notificationsModel.insertCommunicationLogIfNew(sql, workspaceId, {
    invoiceId: invoice.id,
    customerId: invoice.customer_id,
    toAddress: invoice.customer_email,
    subject,
    body: html,
    idempotencyKey,
  });

  // Same key seen before: hand back what already happened instead of
  // sending a second email or touching the invoice a second time.
  if (!logged) {
    return {
      log: await notificationsModel.findCommunicationLogByKey(sql, workspaceId, idempotencyKey),
      invoice,
    };
  }

  const delivery = await deliverEmail(config, { to: invoice.customer_email, subject, html });

  return transaction(sql, async (tx) => {
    const log = await notificationsModel.markCommunicationLogDelivered(tx, logged.id, delivery);

    await invoicesModel.updateInvoiceFields(tx, workspaceId, invoiceId, {
      ...(wasFirstSend ? { status: "sent", sent_at: tx`now()` } : {}),
      last_contacted_at: tx`now()`,
    });

    await collectionsModel.insertCollectionEvent(tx, workspaceId, {
      invoiceId: invoice.id,
      customerId: invoice.customer_id,
      type: wasFirstSend ? "invoice_sent" : "reminder_sent",
      channel: "email",
      summary: wasFirstSend
        ? `Invoice ${invoice.number} sent`
        : `Reminder sent to ${invoice.customer_name}`,
      detail: delivery.sent ? null : `Delivery failed: ${delivery.error}`,
      actor,
      occurredAt: new Date(),
    });

    await auditModel.insertAuditLog(tx, workspaceId, {
      actorUserId: principal.userId,
      actorLabel: actor,
      action: wasFirstSend ? "invoice.sent" : "reminder.sent",
      targetType: "invoice",
      targetId: invoice.id,
    });

    try {
      await dispatchEvent(tx, workspaceId, wasFirstSend ? "invoice.sent" : "reminder.sent", {
        invoice_id: invoice.id,
        invoice_number: invoice.number,
        customer_name: invoice.customer_name,
        amount_cents: invoice.balance_cents,
      });
    } catch {
      // Best-effort: the delivery log already recorded the attempt.
    }

    return { log, invoice: await invoicesModel.findInvoiceForWrite(tx, workspaceId, invoiceId) };
  });
}
