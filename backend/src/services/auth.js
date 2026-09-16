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
} from "../middleware/errors.js";
import {
  findActiveMembership,
  findUserByEmail,
  insertRefreshToken,
  insertUser,
  insertWorkspaceMember,
} from "../models/auth.js";
import { insertEmailTemplates } from "../models/notifications.js";
import { insertWorkspace } from "../models/workspaces.js";

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
