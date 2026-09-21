/**
 * Automations. Owns: automations, automation_runs.
 *
 * runs_30d and recovered_cents_30d are computed, never stored: the first
 * from this workspace's own automation_runs, the second by joining out to
 * payments through collection_events.actor -- see services/invoices.js's
 * actorOverride, which is what puts an automation's own name on the events
 * its sends create instead of a human's.
 */
import { randomUUID } from "node:crypto";

import { firstOr404, inWorkspace } from "./scope.js";

export async function listAutomations(sql, workspaceId) {
  return sql`
    SELECT a.*,
      (SELECT COUNT(*) FROM automation_runs r
        WHERE r.automation_id = a.id AND r.started_at > now() - interval '30 days')::int
        AS runs_30d,
      (SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p
        WHERE p.workspace_id = a.workspace_id
          AND p.received_at > now() - interval '30 days'
          AND p.invoice_id IN (
            SELECT ce.invoice_id FROM collection_events ce
            WHERE ce.workspace_id = a.workspace_id AND ce.actor = a.name
              AND ce.type = 'reminder_sent' AND ce.occurred_at > now() - interval '30 days'
          ))::bigint AS recovered_cents_30d
    FROM automations a
    ${inWorkspace(sql, workspaceId, "a")}
    ORDER BY a.created_at
  `;
}

export async function findAutomation(sql, workspaceId, automationId) {
  const rows = await sql`
    SELECT a.*,
      (SELECT COUNT(*) FROM automation_runs r
        WHERE r.automation_id = a.id AND r.started_at > now() - interval '30 days')::int
        AS runs_30d,
      (SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p
        WHERE p.workspace_id = a.workspace_id
          AND p.received_at > now() - interval '30 days'
          AND p.invoice_id IN (
            SELECT ce.invoice_id FROM collection_events ce
            WHERE ce.workspace_id = a.workspace_id AND ce.actor = a.name
              AND ce.type = 'reminder_sent' AND ce.occurred_at > now() - interval '30 days'
          ))::bigint AS recovered_cents_30d
    FROM automations a
    ${inWorkspace(sql, workspaceId, "a")} AND a.id = ${automationId}
  `;
  return firstOr404(rows, "Automation");
}

export async function createAutomation(sql, workspaceId, { name, description, triggerLabel, triggerDays, tone, nodes }) {
  const [row] = await sql`
    INSERT INTO automations (id, workspace_id, name, description, enabled, trigger_label, trigger_days, tone, nodes)
    VALUES (${randomUUID()}, ${workspaceId}, ${name}, ${description}, false, ${triggerLabel}, ${triggerDays}, ${tone}, ${nodes})
    RETURNING id
  `;
  return findAutomation(sql, workspaceId, row.id);
}

/** Only name, description, enabled and nodes are editable from the builder
 *  today -- trigger_days and tone are fixed at creation (see the schema
 *  comment on automations.trigger_days). */
export async function updateAutomation(sql, workspaceId, automationId, fields) {
  await sql`
    UPDATE automations SET ${sql(fields)}, updated_at = now()
    ${inWorkspace(sql, workspaceId)} AND id = ${automationId}
  `;
  return findAutomation(sql, workspaceId, automationId);
}

export async function listRuns(sql, workspaceId, automationId) {
  await findAutomation(sql, workspaceId, automationId);
  return sql`
    SELECT id, workspace_id, automation_id, matched_count, sent_count, started_at, finished_at
    FROM automation_runs
    ${inWorkspace(sql, workspaceId)} AND automation_id = ${automationId}
    ORDER BY started_at DESC
    LIMIT 30
  `;
}

/** The evaluator's own query -- every enabled automation in every workspace,
 *  which is why it takes no workspaceId: the daily sweep runs once, across
 *  every tenant, not per-workspace. */
export async function listEnabledAutomations(sql) {
  return sql`SELECT * FROM automations WHERE enabled ORDER BY workspace_id`;
}

export async function insertRun(sql, workspaceId, { automationId, matchedCount, sentCount, startedAt, finishedAt }) {
  await sql`
    INSERT INTO automation_runs (id, workspace_id, automation_id, matched_count, sent_count, started_at, finished_at)
    VALUES (${randomUUID()}, ${workspaceId}, ${automationId}, ${matchedCount}, ${sentCount}, ${startedAt}, ${finishedAt})
  `;
  await sql`UPDATE automations SET last_run_at = ${finishedAt} WHERE id = ${automationId}`;
}
