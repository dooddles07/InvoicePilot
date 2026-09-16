/**
 * Password hashing, access tokens, refresh tokens, and who may do what.
 *
 * Knows nothing about HTTP and nothing about the database: everything here
 * takes what it needs as an argument. That is what lets the permission matrix
 * be tested without a request and the token round trip without a server.
 *
 * Ported from app/core/security.py.
 */
import { createHash, randomBytes } from "node:crypto";

import { hash, verify } from "@node-rs/argon2";
import { SignJWT, jwtVerify } from "jose";

export const ACCESS_TOKEN_TTL_MINUTES = 30;
export const REFRESH_TOKEN_TTL_DAYS = 14;

/**
 * What each role may do. Kept as data rather than scattered `if` statements so
 * the permission model can be read in one place -- and tested without a
 * request.
 *
 * Frozen arrays rather than frozen Sets: Object.freeze does not seal a Set's
 * contents, so a frozen Set is a promise JavaScript does not keep. At fifteen
 * entries, `includes` is not a cost worth a weaker guarantee for.
 *
 * Automation permissions are kept even though the automations routes are
 * deferred: the routes exist and are guarded today, and removing the grant
 * would make them 403 for everyone rather than 501.
 */
export const ROLE_PERMISSIONS = Object.freeze({
  owner: Object.freeze(["*"]),
  admin: Object.freeze([
    "invoice:read",
    "invoice:write",
    "customer:read",
    "customer:write",
    "payment:read",
    "payment:write",
    "automation:read",
    "automation:write",
    "report:read",
    "integration:read",
    "integration:write",
    "team:write",
    "workspace:write",
    "audit:read",
    "apikey:write",
  ]),
  member: Object.freeze([
    "invoice:read",
    "invoice:write",
    "customer:read",
    "customer:write",
    "payment:read",
    "payment:write",
    "automation:read",
    "report:read",
    "integration:read",
  ]),
  viewer: Object.freeze([
    "invoice:read",
    "customer:read",
    "payment:read",
    "report:read",
    "integration:read",
  ]),
});

/**
 * Who is making the request, and in which workspace.
 *
 * `workspaceId` is part of the identity rather than a query parameter. Every
 * model function takes it from here, so a caller cannot widen their own scope
 * by editing a URL.
 */
export function makePrincipal(userId, workspaceId, role) {
  return Object.freeze({
    userId,
    workspaceId,
    role,
    can(permission) {
      // An unknown role grants nothing. Python raised KeyError here; a role
      // column holding something unexpected should close the door rather than
      // answer 500.
      const grants = ROLE_PERMISSIONS[role] ?? [];
      return grants.includes("*") || grants.includes(permission);
    },
  });
}

export function hashPassword(plaintext) {
  return hash(plaintext);
}

export async function verifyPassword(plaintext, hashed) {
  try {
    return await verify(hashed, plaintext);
  } catch {
    // A mismatch and an unparseable hash are the same answer to the caller.
    return false;
  }
}

function signingKey(secretKey) {
  return new TextEncoder().encode(secretKey);
}

export function issueAccessToken(principal, secretKey) {
  return new SignJWT({ ws: principal.workspaceId, role: principal.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(principal.userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_MINUTES}m`)
    .sign(signingKey(secretKey));
}

/**
 * Rejects on a bad signature, an expired token, or a wrong algorithm. The
 * caller turns every one of those into the same 401: distinguishing them tells
 * an attacker which guess was closer.
 */
export async function decodeAccessToken(token, secretKey) {
  const { payload } = await jwtVerify(token, signingKey(secretKey), {
    algorithms: ["HS256"],
  });
  return makePrincipal(payload.sub, payload.ws, payload.role);
}

/**
 * A refresh token is an opaque secret, not a JWT.
 *
 * Nothing needs to read anything out of it -- the row in `refresh_tokens`
 * holds the user, the expiry and the rotation chain -- so it carries no claims
 * to forge and no signature to verify.
 */
export function generateRefreshToken() {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256, not argon2.
 *
 * Deliberately different from `hashPassword`: this value is looked up on every
 * refresh, and a 300ms key derivation on the hot path is a self-inflicted
 * denial of service. The token is 256 bits of urandom, so there is no
 * dictionary to attack.
 */
export function hashRefreshToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function refreshExpiry() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86_400_000);
}
