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

/** Only members with a real user behind them -- a pending invite (user_id
 *  IS NULL, held on invited_email) has no User to nest, and the response
 *  type requires one. "Team members" reads as people with access, which a
 *  pending invite is not yet. */
export async function listMembers(sql, workspaceId) {
  const rows = await sql`
    SELECT m.id, m.workspace_id, m.role, m.status, m.last_active_at,
      u.id AS user_id, u.email, u.full_name, u.avatar_url
    FROM workspace_members m
    JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = ${workspaceId} AND m.user_id IS NOT NULL
    ORDER BY m.created_at
  `;
  return rows.map((r) => ({
    id: r.id,
    workspace_id: r.workspace_id,
    user: { id: r.user_id, email: r.email, full_name: r.full_name, avatar_url: r.avatar_url },
    role: r.role,
    status: r.status,
    last_active_at: r.last_active_at,
  }));
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
  "webhook_deliveries",
  "webhook_endpoints",
  "api_keys",
  "automation_runs",
  "automations",
];

export async function deleteWorkspaceData(sql, workspaceId) {
  for (const table of TENANT_TABLES) {
    await sql`DELETE FROM ${sql(table)} WHERE workspace_id = ${workspaceId}`;
  }
  await sql`DELETE FROM workspaces WHERE id = ${workspaceId}`;
}
