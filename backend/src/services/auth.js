/**
 * Sessions: creating them, proving them, rotating them, ending them.
 *
 * Every function takes the database handle as its first argument and opens no
 * transaction of its own. postgres.js gives a transaction callback a handle
 * with .savepoint but no .begin, so a service that opened one would throw the
 * moment a test handed it the rollback transaction -- and the reuse-detection
 * path in refresh() must survive the 401 it raises, which a wrapping
 * transaction would roll back. The controller decides what is atomic.
 *
 * Ported from app/services/auth.py.
 */
import { randomUUID } from "node:crypto";

import {
  ACCESS_TOKEN_TTL_MINUTES,
  generateRefreshToken,
  hashPassword,
  hashRefreshToken,
  issueAccessToken,
  makePrincipal,
  refreshExpiry,
  verifyPassword,
} from "../lib/security.js";
import {
  AuthenticationFailed,
  Conflict,
  NotFound,
} from "../middleware/errors.js";
import {
  findActiveMembership,
  findRefreshTokenByHash,
  findRefreshTokenById,
  findUserByEmail,
  findUserById,
  insertRefreshToken,
  insertUser,
  insertWorkspaceMember,
  revokeRefreshToken,
  setRefreshTokenReplacedBy,
} from "../models/auth.js";
import { insertEmailTemplates } from "../models/notifications.js";
import { findWorkspaceById, insertWorkspace } from "../models/workspaces.js";

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
}

/**
 * Mint an access token and a fresh refresh row for one user.
 *
 * Returns the new refresh row's id alongside the result: rotation needs it for
 * replaced_by_id, and Python re-queried by hash to find what it had just
 * written.
 */
async function issue(sql, config, user, workspace, role) {
  const principal = makePrincipal(user.id, workspace.id, role);
  const accessToken = await issueAccessToken(principal, config.secretKey);

  const refreshToken = generateRefreshToken();
  const refreshTokenId = randomUUID();
  await insertRefreshToken(sql, {
    id: refreshTokenId,
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshExpiry(),
  });

  return {
    refreshTokenId,
    result: {
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        // Seconds, so the caller's cookie max-age needs no knowledge of the TTL.
        expires_in: ACCESS_TOKEN_TTL_MINUTES * 60,
      },
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        avatar_url: user.avatar_url ?? null,
        workspace_id: workspace.id,
        workspace_name: workspace.name,
        role,
      },
    },
  };
}

export async function signup(sql, config, body) {
  const email = body.email.trim();
  if (await findUserByEmail(sql, email)) {
    throw new Conflict("An account with that email already exists");
  }

  const fullName = body.full_name.trim();
  const user = await insertUser(sql, {
    id: randomUUID(),
    email,
    fullName,
    passwordHash: await hashPassword(body.password),
  });

  const workspaceName = `${fullName.split(" ")[0]}'s workspace`;
  const workspace = await insertWorkspace(sql, {
    id: randomUUID(),
    name: workspaceName,
    // Suffixed with part of a uuid: two people with the same first name must
    // not collide on the unique slug.
    slug: `${slugify(workspaceName)}-${randomUUID().replaceAll("-", "").slice(0, 6)}`,
  });

  await insertWorkspaceMember(sql, {
    id: randomUUID(),
    workspaceId: workspace.id,
    userId: user.id,
    role: "owner",
    status: "active",
  });
  await insertEmailTemplates(sql, workspace.id);

  return (await issue(sql, config, user, workspace, "owner")).result;
}

let dummyHash;

/**
 * A real argon2 hash of a value nobody knows, verified against when the email
 * is unknown so the failing path costs the same wall clock as the succeeding
 * one. Computed once and lazily -- hashing at import time would put 300ms on
 * every process start, including the migration CLI.
 */
function unknownEmailHash() {
  dummyHash ??= hashPassword(randomUUID());
  return dummyHash;
}

export async function login(sql, config, body) {
  const user = await findUserByEmail(sql, body.email.trim());
  const passwordHash = user ? user.password_hash : await unknownEmailHash();
  const passwordOk = await verifyPassword(body.password, passwordHash);
  if (!user || !passwordOk) throw new AuthenticationFailed();

  const membership = await findActiveMembership(sql, user.id);
  if (!membership) throw new AuthenticationFailed();

  const { result } = await issue(
    sql,
    config,
    user,
    { id: membership.workspace_id, name: membership.workspace_name },
    membership.role,
  );
  return result;
}

/** Walk replaced_by_id forward and revoke everything it reaches. */
async function revokeChain(sql, row) {
  const now = new Date();
  const seen = new Set();
  let current = row;

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.revoked_at === null) {
      await revokeRefreshToken(sql, current.id, now);
    }
    current = current.replaced_by_id
      ? await findRefreshTokenById(sql, current.replaced_by_id)
      : undefined;
  }
}

export async function refresh(sql, config, token) {
  const row = await findRefreshTokenByHash(sql, hashRefreshToken(token));
  if (!row) throw new AuthenticationFailed();

  if (row.revoked_at !== null) {
    // Presented after it was retired: either a replay or a stolen token.
    // Either way every session descended from it is suspect, so the whole
    // chain goes -- and it must stay gone after the throw below, which is why
    // nothing here runs inside a transaction.
    await revokeChain(sql, row);
    throw new AuthenticationFailed();
  }

  if (row.expires_at <= new Date()) throw new AuthenticationFailed();

  const user = await findUserById(sql, row.user_id);
  if (!user) throw new AuthenticationFailed();

  const membership = await findActiveMembership(sql, user.id);
  if (!membership) throw new AuthenticationFailed();

  const { result, refreshTokenId } = await issue(
    sql,
    config,
    user,
    { id: membership.workspace_id, name: membership.workspace_name },
    membership.role,
  );

  await revokeRefreshToken(sql, row.id, new Date());
  await setRefreshTokenReplacedBy(sql, row.id, refreshTokenId);
  return result;
}

/**
 * Signing out an already-dead session is not an error: the caller's intent --
 * be signed out -- is satisfied either way.
 */
export async function logout(sql, token) {
  const row = await findRefreshTokenByHash(sql, hashRefreshToken(token));
  if (row && row.revoked_at === null) {
    await revokeRefreshToken(sql, row.id, new Date());
  }
}

export async function switchWorkspace(sql, config, principal, workspaceId) {
  const user = await findUserById(sql, principal.userId);
  if (!user) throw new AuthenticationFailed();

  const membership = await findActiveMembership(sql, user.id, workspaceId);
  // 404, not 403: a 403 would confirm the workspace exists.
  if (!membership) throw new NotFound("Workspace not found");

  const { result } = await issue(
    sql,
    config,
    user,
    { id: membership.workspace_id, name: membership.workspace_name },
    membership.role,
  );
  return result;
}

/** Render a principal as the session the frontend builds its shell from. */
export async function describe(sql, principal) {
  const user = await findUserById(sql, principal.userId);
  const workspace = await findWorkspaceById(sql, principal.workspaceId);
  if (!user || !workspace) throw new AuthenticationFailed();

  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    avatar_url: user.avatar_url ?? null,
    workspace_id: workspace.id,
    workspace_name: workspace.name,
    role: principal.role,
  };
}
