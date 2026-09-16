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
