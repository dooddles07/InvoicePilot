/**
 * Audit. Owns: audit_logs.
 *
 * The read side (GET /api/audit) is still not implemented -- Phase 7. The
 * write side lands here first because every write path added in this phase
 * needs somewhere to record itself.
 */
import { randomUUID } from "node:crypto";

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
