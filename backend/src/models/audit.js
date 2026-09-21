/**
 * Audit. Owns: audit_logs.
 */
import { randomUUID } from "node:crypto";

import { inWorkspace, orderPage } from "./scope.js";

/** actor_label is denormalised onto the row on purpose (see the schema
 *  comment on audit_logs): the log must still read correctly after the user
 *  who did this is gone. */
export async function insertAuditLog(sql, workspaceId, { actorUserId, actorLabel, action, targetType, targetId }) {
  await sql`
    INSERT INTO audit_logs (
      id, workspace_id, actor_user_id, actor_label, action, target_type, target_id, occurred_at
    ) VALUES (
      ${randomUUID()}, ${workspaceId}, ${actorUserId}, ${actorLabel}, ${action}, ${targetType}, ${targetId}, now()
    )
  `;
}

// Every action this app currently writes targets an invoice, so a plain
// LEFT JOIN covers the whole table today; a second target_type would need a
// second LEFT JOIN alongside it, not a rewrite of this one.
// ponytail: target_id::uuid assumes every row is a UUID-shaped id, true only
// because 'invoice' is the only target_type written. A future target_type
// with a non-UUID id needs this cast gated behind its own type check.
const ACTION_LABEL = {
  "payment.recorded": "Recorded payment",
  "invoice.created": "Created invoice",
  "invoice.updated": "Updated invoice",
  "invoice.sent": "Sent invoice",
  "reminder.sent": "Sent payment reminder",
};

export async function listAuditLogs(sql, workspaceId, filters) {
  const rows = await sql`
    SELECT al.id, al.workspace_id, al.actor_label, al.action, al.target_type, al.target_id,
      al.ip, al.occurred_at, i.number AS invoice_number, i.customer_name,
      COUNT(*) OVER() AS total
    FROM audit_logs al
    LEFT JOIN invoice_state i
      ON al.target_type = 'invoice' AND i.id = al.target_id::uuid AND i.workspace_id = al.workspace_id
    ${inWorkspace(sql, workspaceId, "al")}
    ${orderPage(sql, filters, "al")}
  `;
  return {
    data: rows.map((r) => ({
      id: r.id,
      workspace_id: r.workspace_id,
      actor: r.actor_label,
      action: ACTION_LABEL[r.action] ?? r.action,
      target: r.invoice_number ? `${r.invoice_number} · ${r.customer_name}` : r.target_id,
      ip: r.ip,
      occurred_at: r.occurred_at,
    })),
    total: rows[0]?.total ?? 0,
  };
}
