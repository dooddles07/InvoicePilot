/**
 * API keys. Owns: api_keys.
 *
 * Also the one model the authenticate middleware imports directly (not
 * through a controller): authenticateApiKey turns a bearer token into a
 * Principal the same way decodeAccessToken does for a JWT, so the two
 * credential shapes are indistinguishable past the middleware.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { makePrincipal } from "../lib/security.js";
import { firstOr404, inWorkspace } from "./scope.js";

export const API_KEY_PREFIX = "ip_live_";

function hashKey(key) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

// A key with write scope acts like a member (invoice/payment/customer
// read+write); read-only acts like a viewer. Neither role holds
// apikey:write, so a key can never mint or revoke another key through
// itself -- the same reasoning as a refresh token being unable to change
// its own expiry.
function scopesToRole(scopes) {
  return scopes.includes("write") ? "member" : "viewer";
}

export async function listApiKeys(sql, workspaceId) {
  return sql`
    SELECT id, workspace_id, name, last_four, scopes, created_at, last_used_at
    FROM api_keys
    ${inWorkspace(sql, workspaceId)} AND revoked_at IS NULL
    ORDER BY created_at DESC
  `;
}

/** The full key is returned only here, once. The row keeps its hash and
 *  last four characters -- the same shape refresh_tokens.token_hash uses,
 *  so a leaked database yields no usable key. */
export async function createApiKey(sql, workspaceId, { name, scopes }) {
  const secret = randomBytes(24).toString("base64url");
  const key = `${API_KEY_PREFIX}${secret}`;
  const [row] = await sql`
    INSERT INTO api_keys (id, workspace_id, name, key_hash, last_four, scopes)
    VALUES (${randomUUID()}, ${workspaceId}, ${name}, ${hashKey(key)}, ${secret.slice(-4)}, ${scopes})
    RETURNING id, workspace_id, name, last_four, scopes, created_at, last_used_at
  `;
  return { ...row, key };
}

export async function revokeApiKey(sql, workspaceId, keyId) {
  const rows = await sql`
    UPDATE api_keys SET revoked_at = now()
    ${inWorkspace(sql, workspaceId)} AND id = ${keyId} AND revoked_at IS NULL
    RETURNING id
  `;
  firstOr404(rows, "API key");
}

/** Called from the authenticate middleware. Returns null rather than
 *  throwing -- the middleware turns "no principal" into the same 401 a bad
 *  JWT gets, and a lookup miss is not itself an error worth logging. */
export async function authenticateApiKey(sql, token) {
  const hash = hashKey(token);
  const rows = await sql`
    SELECT workspace_id, scopes FROM api_keys
    WHERE key_hash = ${hash} AND revoked_at IS NULL
  `;
  const row = rows[0];
  if (!row) return null;

  // Fire-and-forget: timestamping a key's use must not add a write's
  // latency to every request that key makes.
  sql`UPDATE api_keys SET last_used_at = now() WHERE key_hash = ${hash}`.catch(() => {});

  return makePrincipal(null, row.workspace_id, scopesToRole(row.scopes));
}
