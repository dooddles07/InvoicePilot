/**
 * Workspaces. Owns: workspaces, workspace_members.
 *
 * The member-facing queries live in models/auth.js while auth is the only
 * caller. They move here when the workspaces routes stop returning 501.
 */

export async function insertWorkspace(sql, workspace) {
  const [row] = await sql`
    INSERT INTO workspaces (id, name, slug)
    VALUES (${workspace.id}, ${workspace.name}, ${workspace.slug})
    RETURNING id, name, slug
  `;
  return row;
}

export async function findWorkspaceById(sql, id) {
  const [row] = await sql`SELECT id, name, slug FROM workspaces WHERE id = ${id}`;
  return row;
}

/**
 * The oldest member with a real user behind it. The reseed needs to know who
 * owns the rebuilt workspace, and the answer is whoever owned the old one.
 */
export async function findFirstMember(sql, workspaceId) {
  const [row] = await sql`
    SELECT user_id, role FROM workspace_members
    WHERE workspace_id = ${workspaceId} AND user_id IS NOT NULL
    ORDER BY created_at
    LIMIT 1
  `;
  return row;
}

/**
 * Child rows first, then the workspace.
 *
 * Not a bare DELETE FROM workspaces relying on ON DELETE CASCADE:
 * invoices.customer_id is ON DELETE RESTRICT, both tables cascade from
 * workspaces, and PostgreSQL does not define which sibling cascade fires
 * first. RESTRICT raises immediately rather than deferring to the end of the
 * statement, so the cascade can fail on its own schema. The list is boring and
 * it cannot.
 *
 * `users` is not here: it is not workspace-scoped, and leaving the demo user
 * in place is what lets a reseed keep its password.
 */
const TENANT_TABLES = [
  "collection_events",
  "communication_logs",
  "audit_logs",
  "invoice_items",
  "payments",
  "invoices",
  "customers",
  "email_templates",
  "import_batches",
  "workspace_members",
];

export async function deleteWorkspaceData(sql, workspaceId) {
  for (const table of TENANT_TABLES) {
    await sql`DELETE FROM ${sql(table)} WHERE workspace_id = ${workspaceId}`;
  }
  await sql`DELETE FROM workspaces WHERE id = ${workspaceId}`;
}
