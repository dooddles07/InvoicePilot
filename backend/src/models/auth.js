/**
 * Authentication. Owns: users, refresh_tokens, workspace_members.
 *
 * Every function takes the database handle as its first argument -- the pool
 * in production, a transaction in a test -- and cannot tell which it was
 * given. Rows come back with their column names, because the wire shapes are
 * snake_case too and a mapping layer would exist only to be maintained.
 */

export async function insertUser(sql, user) {
  const [row] = await sql`
    INSERT INTO users (id, email, full_name, password_hash)
    VALUES (${user.id}, ${user.email}, ${user.fullName}, ${user.passwordHash})
    RETURNING id, email, full_name, avatar_url
  `;
  return row;
}

/**
 * Matched on LOWER(email), which is what uq_users_email_lower indexes. A
 * case-sensitive lookup would let one address sign up twice and then log in
 * as neither.
 */
export async function findUserByEmail(sql, email) {
  const [row] = await sql`
    SELECT id, email, full_name, avatar_url, password_hash
    FROM users WHERE LOWER(email) = LOWER(${email})
  `;
  return row;
}

export async function findUserById(sql, id) {
  const [row] = await sql`
    SELECT id, email, full_name, avatar_url, password_hash
    FROM users WHERE id = ${id}
  `;
  return row;
}

export async function insertWorkspaceMember(sql, member) {
  await sql`
    INSERT INTO workspace_members (id, workspace_id, user_id, role, status)
    VALUES (
      ${member.id}, ${member.workspaceId}, ${member.userId},
      ${member.role}, ${member.status}
    )
  `;
}

/**
 * The workspace a login lands in.
 *
 * With no `workspaceId`, the oldest active membership wins, which keeps a
 * returning user in the workspace they think of as theirs rather than
 * whichever one was created last.
 */
export async function findActiveMembership(sql, userId, workspaceId = null) {
  const [row] = await sql`
    SELECT w.id AS workspace_id, w.name AS workspace_name, m.role
    FROM workspace_members m
    JOIN workspaces w ON w.id = m.workspace_id
    WHERE m.user_id = ${userId}
      AND m.status = 'active'
      ${workspaceId === null ? sql`` : sql`AND w.id = ${workspaceId}`}
    ORDER BY m.created_at
    LIMIT 1
  `;
  return row;
}

export async function insertRefreshToken(sql, token) {
  await sql`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
    VALUES (${token.id}, ${token.userId}, ${token.tokenHash}, ${token.expiresAt})
  `;
}

const REFRESH_COLUMNS = ["id", "user_id", "token_hash", "expires_at", "revoked_at", "replaced_by_id"];

export async function findRefreshTokenByHash(sql, tokenHash) {
  const [row] = await sql`
    SELECT ${sql(REFRESH_COLUMNS)} FROM refresh_tokens WHERE token_hash = ${tokenHash}
  `;
  return row;
}

export async function findRefreshTokenById(sql, id) {
  const [row] = await sql`
    SELECT ${sql(REFRESH_COLUMNS)} FROM refresh_tokens WHERE id = ${id}
  `;
  return row;
}

export async function revokeRefreshToken(sql, id, revokedAt) {
  await sql`UPDATE refresh_tokens SET revoked_at = ${revokedAt} WHERE id = ${id}`;
}

export async function setRefreshTokenReplacedBy(sql, id, replacedById) {
  await sql`
    UPDATE refresh_tokens SET replaced_by_id = ${replacedById} WHERE id = ${id}
  `;
}
