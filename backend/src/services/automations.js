/**
 * Automations: creation and the daily evaluator.
 *
 * The evaluator is the promise "Resend live from Phase 6 makes an automation
 * that actually sends reachable" made real: once a day (Vercel Hobby crons
 * run no more often than that), every enabled automation finds the invoices
 * past its trigger_days threshold and sends each one a reminder through the
 * exact same sendInvoiceEmail path a person clicking "Send reminder" uses.
 */
import { createHash, randomUUID } from "node:crypto";

import * as automationsModel from "../models/automations.js";
import * as invoicesModel from "../models/invoices.js";
import { sendInvoiceEmail } from "./invoices.js";

const DAY_MS = 86_400_000;

export async function createAutomation(sql, workspaceId, body) {
  const nodes = body.nodes ?? [
    {
      id: randomUUID(),
      type: "trigger",
      title: body.trigger_label,
      detail: `${body.trigger_days} days overdue`,
    },
  ];
  return automationsModel.createAutomation(sql, workspaceId, {
    name: body.name,
    description: body.description ?? "",
    triggerLabel: body.trigger_label,
    triggerDays: body.trigger_days,
    tone: body.tone ?? "friendly",
    nodes,
  });
}

/**
 * One automation, one day's worth of matching invoices. A cooldown (3 days
 * since last contact) stops the same invoice being re-sent every single day
 * it stays overdue -- without it, a workspace with one long-overdue invoice
 * would get one email per day, forever.
 */
export async function evaluateAutomation(sql, config, automation) {
  const startedAt = new Date();
  const dateKey = startedAt.toISOString().slice(0, 10);

  const overdue = await invoicesModel.listInvoices(sql, automation.workspace_id, {
    limit: 500,
    offset: 0,
    sort: "due_date",
    order: "asc",
    overdue: true,
  });

  const matched = overdue.data.filter((invoice) => {
    if (invoice.status === "disputed") return false;
    if (invoice.days_overdue < automation.trigger_days) return false;
    if (!invoice.last_contacted_at) return true;
    const sinceContact = (startedAt.getTime() - new Date(invoice.last_contacted_at).getTime()) / DAY_MS;
    return sinceContact >= 3;
  });

  let sentCount = 0;
  const automationPrincipal = { userId: null, workspaceId: automation.workspace_id };
  for (const invoice of matched) {
    try {
      await sendInvoiceEmail(sql, config, automation.workspace_id, automationPrincipal, invoice.id, {
        tone: automation.tone,
        // idempotency_key is varchar(64); the two UUIDs alone would blow it,
        // so hash them down instead of shortening the concept.
        idempotencyKey: `auto-${createHash("sha256")
          .update(`${automation.id}:${invoice.id}:${dateKey}`)
          .digest("hex")
          .slice(0, 40)}`,
        actorOverride: automation.name,
      });
      sentCount += 1;
    } catch {
      // One invoice failing (disputed mid-run, paid in full a moment ago)
      // must not stop the rest of the batch.
    }
  }

  await automationsModel.insertRun(sql, automation.workspace_id, {
    automationId: automation.id,
    matchedCount: matched.length,
    sentCount,
    startedAt,
    finishedAt: new Date(),
  });

  return { automationId: automation.id, matched: matched.length, sent: sentCount };
}

export async function evaluateAllAutomations(sql, config) {
  const automations = await automationsModel.listEnabledAutomations(sql);
  const results = [];
  for (const automation of automations) {
    results.push(await evaluateAutomation(sql, config, automation));
  }
  return results;
}
