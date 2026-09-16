# Express Backend Port P2 — Auth and Routers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the authentication subsystem from Python to JavaScript — password hashing, access tokens, refresh-token rotation and the permission matrix — and mount all 55 endpoints on the Express app, six of them doing real work and forty-nine answering `501`.

**Architecture:** `lib/security.js` holds the primitives and the role/permission data, with no knowledge of HTTP or the database. `middleware/authenticate.js` turns a bearer token into `request.principal`; `middleware/require.js` guards one route with one named permission. `services/auth.js` holds the session rules and is handed a database handle it never opens a transaction on — the controller wraps a use case in `sql.begin()`, and a test wraps the same call in `withRollback`. Routers wire paths to guards and controllers; controllers validate with Zod, delegate, and shape.

**Tech Stack:** Node 22, JavaScript (ESM), Express 5, `postgres` (postgres.js), `@node-rs/argon2`, `jose`, `zod`, `node:test`, `node:assert/strict`, PostgreSQL 16+.

**Spec:** `docs/superpowers/specs/2026-09-15-express-backend-port-design.md`

## Global Constraints

- JavaScript only under `backend/`. No TypeScript, no `.ts` files, no build step. `"type": "module"` — ESM everywhere, no `require`.
- Node 22. `node --test` is the test runner; Vitest is not a dependency of this package.
- Money is integer minor units: `amount_cents`, `paid_cents`, `balance_cents` are `bigint`. Never `float`, never `numeric`, never a formatted string.
- Every tenant table carries `workspace_id` with an index that leads on it.
- The database client is configured `max: 5`, `prepare: false`. Neon's pooled endpoint runs PgBouncer in transaction mode, which rejects prepared statements.
- Tests require `DATABASE_URL` to point at a database whose name contains `test`. The suite drops and recreates the `public` schema on every run.
- No module reads the environment or opens a connection at import time. Configuration and the client are built on first use.
- Commit messages: Conventional Commits, no AI attribution trailer.
- Access tokens are HS256 with claims `sub`, `ws`, `role`, `iat`, `exp` and a thirty-minute expiry. Refresh tokens are 32 bytes of urandom, base64url, stored only as a SHA-256 hex digest.
- `ROLE_PERMISSIONS` ports verbatim, wart included: `billing:write` is granted by no role, so only `owner` reaches `POST /api/billing/subscription` through `*`. Fixing that is a separate decision, not this port's.
- The workspace comes from the signed token and nowhere else. No handler reads a workspace id from a body, a query string or a path segment to decide what it may touch.
- No CORS middleware, and no cookie reading. The browser never calls this service; the Next server does, with a bearer token.

## Scope

**In P2:** `lib/security.js`, `middleware/authenticate.js`, `middleware/require.js`, `services/auth.js`, the auth-related model functions, Zod request schemas, all 14 routers and 14 controllers, and the security, permissions, auth-service, auth-route, stub-route and tenancy suites.

**Not in P2:** `db/seed.js` and the reseed endpoint, deleting the Python backend, the `vercel.json` reduction, and deploying either service. All of that is P3. The thirteen non-auth domains get a router, a controller and a `501` — no model functions, no services.

**Python stays runnable.** `backend/app/` is the reference this phase is compared against. It is deleted in P3, not here.

## Corrections to the spec

Four things in the spec do not survive contact with the code. Each is a
deliberate, recorded decision rather than drift — spec §14 says anything this
port appears to change that is not the host, the language or the framework is a
defect, so the changes that *are* intended are listed here.

**1. There are six real endpoints, not five.** Spec §1 and §13 say five
endpoints do real work — signup, login, refresh, logout, switch-workspace.
`GET /api/users/me` is a sixth: `app/api/routes/users.py:17` calls
`AuthService.describe`, and `src/lib/api/session.ts:35` is the only thing
standing between a signed-in browser and the login page. It ships real in P2.
That makes the stub count 49, not 50.

**2. A missing `Authorization` header answers 401, not FastAPI's 403.**
`HTTPBearer(auto_error=True)` raises 403 when the header is absent, while
`get_principal` raises 401 when the header is present but the token is bad — a
FastAPI wart the Python suite already hedged around
(`test_me_without_a_token_is_401_or_403`). The port answers 401 with
`WWW-Authenticate: Bearer` in both cases, which is what RFC 7235 specifies,
what `middleware/errors.js` already does for `AuthenticationFailed`, and what
`src/lib/api/session.ts` treats as "signed out". Nothing in the frontend
depends on the 403.

**3. The 401 and 422 bodies carry a fixed detail string.** Python answers
`{"detail": "Not authenticated"}` for a bad token and a Pydantic error list for
an invalid body. `AuthenticationFailed` is fixed-detail by construction in
`middleware/errors.js` — P1 shipped it that way, with a test — so a bad token
answers `{"detail": "Invalid credentials"}` and an invalid body answers
`{"detail": "Invalid request"}`. `readDetail` in `src/lib/api/client.ts` reads
a *string* `detail` and falls back to `statusText`, so the Pydantic list was
never reaching a screen. Status codes are unchanged, which is what spec §13's
acceptance criterion asks for.

**4. The shared scoping helper lands in P3, not P2.** Spec §5 requires every
model function to build its statement through one shared scoping helper. P2 has
no tenant-scoped model function to route through one: the thirteen domains that
own tenant tables are all stubs, and the auth model touches `users` and
`refresh_tokens`, which are not workspace-scoped. A helper whose only caller is
its own test is a shape guessed rather than driven, so it is built in P3
alongside the first models that need it. What P2 owes the spec is the
*guarantee*, and the tenancy suite in Task 9 asserts the part of it that exists
now: the workspace is read from the signed token, switching to a workspace you
do not belong to is a 404, and no stub route is reachable without a token.

One clarification, not a change: spec §5 says the workspace id is a model
function's first argument. In a JavaScript port there is no repository object
to hold the database handle, so the handle is the first argument and the
workspace id is the second. The property it protects is unchanged.

## Transactions: who opens them

Verified against `backend/node_modules/postgres/src/index.js:234-290`. The
handle postgres.js passes into a `sql.begin(fn)` callback carries `.savepoint`
and `.prepare`, and **does not carry `.begin`**. A service function that opened
its own transaction would therefore throw `TypeError: sql.begin is not a
function` the moment a test handed it the `withRollback` transaction.

So: **a service function takes a handle and never opens a transaction.** The
caller decides.

- In `app.js`, a controller wraps a multi-statement use case in `sql.begin()`.
- In a test, `withRollback` supplies the handle and discards the work.

This moves transaction ownership one layer out from where `app/services/auth.py`
put it. The atomicity is identical — signup is still one transaction — and it is
what makes the auth service testable without a commit.

## File Structure

```
backend/
├── package.json                  modified: @node-rs/argon2, jose, zod
├── src/
│   ├── app.js                    modified: createApp(config, sql), mounts 14 routers under /api
│   ├── lib/
│   │   └── security.js           new: argon2, JWT, refresh tokens, ROLE_PERMISSIONS, Principal
│   ├── middleware/
│   │   ├── authenticate.js       new: bearer token to request.principal
│   │   └── require.js            new: requirePermission(name)
│   ├── services/
│   │   └── auth.js               new: signup, login, refresh, logout, switchWorkspace, describe
│   ├── models/
│   │   ├── auth.js               modified: users, refresh_tokens, workspace_members
│   │   ├── workspaces.js         modified: insertWorkspace, findWorkspaceById
│   │   └── notifications.js      modified: insertEmailTemplates
│   ├── routes/                   new: 14 files
│   └── controllers/              new: 14 files, plus not-implemented.js
└── tests/
    ├── helpers/app.js            new: withApp — a listening app bound to one transaction
    ├── security.test.js          new: ported from tests/test_security.py
    ├── permissions.test.js       new: ported from tests/test_permissions.py
    ├── authenticate.test.js      new
    ├── models-auth.test.js       new
    ├── auth-service.test.js      new: ported from tests/test_auth_service.py
    ├── auth-routes.test.js       new: ported from tests/test_auth_routes.py
    ├── stub-routes.test.js       new
    ├── tenancy.test.js           new
    └── health.test.js            modified: createApp takes a second argument
```

`routes/` and `controllers/` each get one file per domain: `ai`, `audit`,
`auth`, `automations`, `billing`, `collections`, `customers`, `integrations`,
`invoices`, `notifications`, `payments`, `reports`, `users`, `workspaces`.

---

### Task 1: Dependencies and `lib/security.js`

**Files:**
- Modify: `backend/package.json`
- Create: `backend/src/lib/security.js`
- Test: `backend/tests/security.test.js`

**Interfaces:**
- Consumes: nothing. This module imports no other application file, reads no environment and opens no connection.
- Produces:
  - `ACCESS_TOKEN_TTL_MINUTES = 30`, `REFRESH_TOKEN_TTL_DAYS = 14`
  - `ROLE_PERMISSIONS` — a frozen object, role name to frozen array of permission strings
  - `makePrincipal(userId, workspaceId, role)` — frozen object `{ userId, workspaceId, role, can(permission) }`. All three fields are strings; ids are UUID strings, which postgres.js binds to `uuid` columns directly.
  - `hashPassword(plaintext) => Promise<string>`
  - `verifyPassword(plaintext, hashed) => Promise<boolean>`
  - `issueAccessToken(principal, secretKey) => Promise<string>`
  - `decodeAccessToken(token, secretKey) => Promise<Principal>` — rejects on any signature, expiry or shape failure
  - `generateRefreshToken() => string` (43 characters, base64url)
  - `hashRefreshToken(token) => string` (64 hex characters)
  - `refreshExpiry() => Date`

The secret key is a parameter rather than something this module reads from the
environment. `config.js` already owns "read the environment once, fail fast",
and a primitive that reaches for `process.env` cannot be tested without one.

- [ ] **Step 1: Install the three dependencies**

Run from `backend/`:

```bash
npm install @node-rs/argon2 jose zod@^4.5.4
```

`zod` is pinned to the major the frontend already runs (`package.json:33`,
`zod@^4.5.4`) so the two services cannot disagree about what `z.email()` means.
`@node-rs/argon2` ships prebuilt binaries, so Render's build runs no node-gyp.
`jose` is a zero-dependency native-ESM JWT implementation.

Argon2 parameters are the `@node-rs/argon2` defaults — 19 MB, time cost 2,
Argon2id, the current OWASP recommendation — not `argon2-cffi`'s 64 MB.
Render's free tier has 512 MB for the whole process. No hash exists in any
deployed database, and Argon2 encodes its parameters in the hash string, so
this would be a compatible change even if one did.

- [ ] **Step 2: Write the failing security test**

Create `backend/tests/security.test.js`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACCESS_TOKEN_TTL_MINUTES,
  REFRESH_TOKEN_TTL_DAYS,
  decodeAccessToken,
  generateRefreshToken,
  hashPassword,
  hashRefreshToken,
  issueAccessToken,
  makePrincipal,
  refreshExpiry,
  verifyPassword,
} from "../src/lib/security.js";

const SECRET = "test-only-key-that-is-long-enough-for-hs256";
const OTHER_SECRET = "a-different-key-that-is-also-long-enough-!!";

function principal(role) {
  return makePrincipal(
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    role,
  );
}

describe("passwords", () => {
  it("round trips, and rejects the wrong one", async () => {
    const hashed = await hashPassword("correct horse battery staple");
    assert.notEqual(hashed, "correct horse battery staple");
    assert.equal(await verifyPassword("correct horse battery staple", hashed), true);
    assert.equal(await verifyPassword("wrong horse battery staple", hashed), false);
  });

  it("answers false for a hash it cannot parse", async () => {
    // A corrupted or truncated column must read as "does not match", not as a
    // 500 that tells the caller their guess was interesting.
    assert.equal(await verifyPassword("anything", "not-an-argon2-hash"), false);
  });

  it("salts, so the same password hashes differently twice", async () => {
    const [first, second] = await Promise.all([
      hashPassword("correct horse battery staple"),
      hashPassword("correct horse battery staple"),
    ]);
    assert.notEqual(first, second);
  });
});

describe("access tokens", () => {
  it("carry the workspace scope through a round trip", async () => {
    const original = principal("member");
    const decoded = await decodeAccessToken(
      await issueAccessToken(original, SECRET),
      SECRET,
    );

    // The workspace travels inside the signed token, so a caller cannot widen
    // their own scope by editing a request.
    assert.equal(decoded.workspaceId, original.workspaceId);
    assert.equal(decoded.userId, original.userId);
    assert.equal(decoded.role, "member");
  });

  it("refuse a signature from another key", async () => {
    const token = await issueAccessToken(principal("owner"), SECRET);
    await assert.rejects(() => decodeAccessToken(token, OTHER_SECRET));
  });

  it("refuse a token that is not a token", async () => {
    await assert.rejects(() => decodeAccessToken("neither.a.jwt", SECRET));
  });
});

describe("the permission matrix, by role", () => {
  it("lets a viewer read and not write", () => {
    const viewer = principal("viewer");
    assert.equal(viewer.can("invoice:read"), true);
    assert.equal(viewer.can("invoice:write"), false);
    assert.equal(viewer.can("team:write"), false);
  });

  it("lets a member collect but not configure", () => {
    const member = principal("member");
    assert.equal(member.can("invoice:write"), true);
    assert.equal(member.can("payment:write"), true);
    // Working the queue is not the same authority as changing how money is
    // chased, or who else can chase it.
    assert.equal(member.can("automation:write"), false);
    assert.equal(member.can("team:write"), false);
  });

  it("gives an owner everything through the wildcard", () => {
    const owner = principal("owner");
    for (const permission of [
      "invoice:write",
      "team:write",
      "apikey:write",
      "anything:at:all",
    ]) {
      assert.equal(owner.can(permission), true, permission);
    }
  });

  it("grants nothing to a role nobody defined", () => {
    // Python raised KeyError here. A role column holding something unexpected
    // should close the door, not answer 500.
    assert.equal(principal("superuser").can("invoice:read"), false);
  });
});

describe("refresh tokens", () => {
  it("are unpredictable and unique", () => {
    const tokens = new Set(Array.from({ length: 100 }, generateRefreshToken));
    assert.equal(tokens.size, 100);
    // 32 bytes of urandom, base64url-encoded without padding.
    assert.ok([...tokens].every((token) => token.length === 43));
  });

  it("hash deterministically, and the hash hides the token", () => {
    // Stored hashed so a database disclosure hands over no live sessions.
    const token = generateRefreshToken();
    const digest = hashRefreshToken(token);
    assert.equal(digest, hashRefreshToken(token));
    assert.equal(digest.length, 64);
    assert.ok(!digest.includes(token));
  });

  it("expire a fortnight out, as a Date", () => {
    // A Date, not a string: postgres.js binds a Date to timestamptz with its
    // offset intact, and binds a string by hoping. The symptom of getting this
    // wrong is sessions that expire at the wrong hour.
    const expiry = refreshExpiry();
    assert.ok(expiry instanceof Date);
    const days = (expiry.getTime() - Date.now()) / 86_400_000;
    assert.ok(Math.abs(days - REFRESH_TOKEN_TTL_DAYS) < 0.01, `${days} days`);
  });
});

describe("the configured lifetimes", () => {
  it("match the Python service", () => {
    assert.equal(ACCESS_TOKEN_TTL_MINUTES, 30);
    assert.equal(REFRESH_TOKEN_TTL_DAYS, 14);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run from `backend/`:

```bash
node --test tests/security.test.js
```

Expected: FAIL with `Cannot find module` for `../src/lib/security.js`.

- [ ] **Step 4: Write the security module**

Create `backend/src/lib/security.js`:

```js
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run from `backend/`:

```bash
node --test tests/security.test.js
```

Expected: PASS, 14 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/lib/security.js backend/tests/security.test.js
git commit -m "feat: port the security primitives and the permission data"
```

---

### Task 2: The authenticate and require middleware

**Files:**
- Create: `backend/src/middleware/authenticate.js`
- Create: `backend/src/middleware/require.js`
- Test: `backend/tests/authenticate.test.js`

**Interfaces:**
- Consumes: `makePrincipal`, `issueAccessToken`, `decodeAccessToken` from Task 1; `AuthenticationFailed`, `PermissionDenied` from `middleware/errors.js` (P1).
- Produces:
  - `authenticate(secretKey)` — returns an Express middleware that sets `request.principal` and calls `next()`, or rejects with `AuthenticationFailed`.
  - `requirePermission(permission)` — returns an Express middleware that calls `next()` or throws `PermissionDenied` with the detail `Requires <permission>`.

Both are factories because the guard is the same code with a different
argument, and because `authenticate` needs the signing key without reading the
environment.

Express 5 routes a rejected handler promise to the error middleware on its own,
so neither of these catches anything, and no controller needs a `try`/`catch`.

- [ ] **Step 1: Write the failing middleware test**

Create `backend/tests/authenticate.test.js`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { authenticate } from "../src/middleware/authenticate.js";
import { requirePermission } from "../src/middleware/require.js";
import {
  AuthenticationFailed,
  PermissionDenied,
} from "../src/middleware/errors.js";
import { issueAccessToken, makePrincipal } from "../src/lib/security.js";

const SECRET = "test-only-key-that-is-long-enough-for-hs256";
const USER = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";

function fakeRequest(authorization) {
  return {
    path: "/api/users/me",
    get(name) {
      return name.toLowerCase() === "authorization" ? authorization : undefined;
    },
  };
}

async function tokenFor(role) {
  return issueAccessToken(makePrincipal(USER, WORKSPACE, role), SECRET);
}

describe("authenticate", () => {
  it("puts the principal on the request and continues", async () => {
    const request = fakeRequest(`Bearer ${await tokenFor("admin")}`);
    let continued = false;

    await authenticate(SECRET)(request, {}, () => {
      continued = true;
    });

    assert.equal(continued, true);
    assert.equal(request.principal.userId, USER);
    assert.equal(request.principal.workspaceId, WORKSPACE);
    assert.equal(request.principal.role, "admin");
  });

  it("accepts the scheme in any case", async () => {
    const request = fakeRequest(`bearer ${await tokenFor("viewer")}`);
    await authenticate(SECRET)(request, {}, () => {});
    assert.equal(request.principal.role, "viewer");
  });

  it("rejects a missing header with 401, not FastAPI's 403", async () => {
    // Deliberate divergence from HTTPBearer(auto_error=True), which answers
    // 403 for an absent header. 401 with WWW-Authenticate is what RFC 7235
    // specifies and what src/lib/api/session.ts reads as "signed out".
    await assert.rejects(
      () => authenticate(SECRET)(fakeRequest(undefined), {}, () => {}),
      AuthenticationFailed,
    );
  });

  it("rejects a header that is not a bearer scheme", async () => {
    await assert.rejects(
      () => authenticate(SECRET)(fakeRequest("Basic abc123"), {}, () => {}),
      AuthenticationFailed,
    );
  });

  it("rejects a token signed with another key", async () => {
    const token = await issueAccessToken(
      makePrincipal(USER, WORKSPACE, "owner"),
      "a-different-key-that-is-also-long-enough-!!",
    );
    await assert.rejects(
      () => authenticate(SECRET)(fakeRequest(`Bearer ${token}`), {}, () => {}),
      AuthenticationFailed,
    );
  });

  it("answers a malformed token exactly as it answers a forged one", async () => {
    // Uniform on purpose: distinguishing "expired" from "malformed" from
    // "wrong signature" tells an attacker which of their guesses was closer.
    const failures = [];
    for (const header of ["Bearer", "Bearer not.a.jwt", "Bearer "]) {
      await authenticate(SECRET)(fakeRequest(header), {}, () => {}).catch(
        (error) => failures.push(error.detail),
      );
    }
    assert.deepEqual(failures, [
      "Invalid credentials",
      "Invalid credentials",
      "Invalid credentials",
    ]);
  });
});

describe("requirePermission", () => {
  it("continues when the principal has the permission", () => {
    const request = { principal: makePrincipal(USER, WORKSPACE, "member") };
    let continued = false;
    requirePermission("invoice:write")(request, {}, () => {
      continued = true;
    });
    assert.equal(continued, true);
  });

  it("names the permission it refused", () => {
    const request = { principal: makePrincipal(USER, WORKSPACE, "viewer") };
    assert.throws(
      () => requirePermission("invoice:write")(request, {}, () => {}),
      (error) => {
        assert.ok(error instanceof PermissionDenied);
        assert.equal(error.status, 403);
        assert.equal(error.detail, "Requires invoice:write");
        return true;
      },
    );
  });

  it("refuses when nothing authenticated the request", () => {
    // Belt and braces: a router that mounts the guard without authenticate
    // first is a bug, and it must fail closed.
    assert.throws(
      () => requirePermission("invoice:read")({}, {}, () => {}),
      PermissionDenied,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run from `backend/`:

```bash
node --test tests/authenticate.test.js
```

Expected: FAIL with `Cannot find module` for `../src/middleware/authenticate.js`.

- [ ] **Step 3: Write the authenticate middleware**

Create `backend/src/middleware/authenticate.js`:

```js
/**
 * Bearer token to Principal.
 *
 * The service accepts `Authorization: Bearer` and nothing else. It reads no
 * cookie, which is what makes a cross-site request unable to drive it: the
 * attacker's page cannot read the httpOnly cookie the browser holds, and this
 * API does not accept one.
 *
 * Ported from the get_principal half of app/api/deps.py.
 */
import { decodeAccessToken } from "../lib/security.js";
import { AuthenticationFailed } from "./errors.js";

export function authenticate(secretKey) {
  return async function authenticateRequest(request, response, next) {
    const [scheme, token] = (request.get("authorization") ?? "").split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new AuthenticationFailed();
    }

    try {
      request.principal = await decodeAccessToken(token, secretKey);
    } catch {
      // Uniform whatever the cause. Distinguishing "expired" from "malformed"
      // from "wrong signature" tells an attacker which guess was closer.
      throw new AuthenticationFailed();
    }

    next();
  };
}
```

- [ ] **Step 4: Write the permission guard**

Create `backend/src/middleware/require.js`:

```js
/**
 * Guard a route with a single named permission.
 *
 * Mounted after `authenticate`, never instead of it: with no principal on the
 * request this fails closed rather than reading `undefined.can`.
 *
 * Ported from the require() factory in app/api/deps.py.
 */
import { PermissionDenied } from "./errors.js";

export function requirePermission(permission) {
  return function requirePermissionOnRequest(request, response, next) {
    if (!request.principal?.can(permission)) {
      throw new PermissionDenied(`Requires ${permission}`);
    }
    next();
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run from `backend/`:

```bash
node --test tests/authenticate.test.js
```

Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/middleware/authenticate.js backend/src/middleware/require.js backend/tests/authenticate.test.js
git commit -m "feat: authenticate a bearer token and guard a named permission"
```

---

### Task 3: The permission matrix suite

**Files:**
- Test: `backend/tests/permissions.test.js`

**Interfaces:**
- Consumes: `ROLE_PERMISSIONS`, `makePrincipal` from Task 1.
- Produces: nothing importable. This is the matrix from spec §5 asserted cell by cell.

A matrix that drifts silently is the failure mode worth a test of its own: a
route guarded by a permission nobody was granted is a 403 for everyone, and a
permission granted to the wrong role is a quiet privilege escalation. Both look
like working code.

The reverse check — that no router guards a permission missing from the matrix
— needs the routers, so it lands in Task 8 with them.

- [ ] **Step 1: Write the matrix test**

Create `backend/tests/permissions.test.js`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ROLE_PERMISSIONS, makePrincipal } from "../src/lib/security.js";

// Rows are permissions, columns are the roles that hold them. Copied from
// spec section 5, and from app/tests/test_permissions.py before it.
const MATRIX = {
  "invoice:read": ["owner", "admin", "member", "viewer"],
  "customer:read": ["owner", "admin", "member", "viewer"],
  "payment:read": ["owner", "admin", "member", "viewer"],
  "report:read": ["owner", "admin", "member", "viewer"],
  "integration:read": ["owner", "admin", "member", "viewer"],
  "automation:read": ["owner", "admin", "member"],
  "automation:write": ["owner", "admin"],
  "invoice:write": ["owner", "admin", "member"],
  "customer:write": ["owner", "admin", "member"],
  "payment:write": ["owner", "admin", "member"],
  "integration:write": ["owner", "admin"],
  "team:write": ["owner", "admin"],
  "workspace:write": ["owner", "admin"],
  "audit:read": ["owner", "admin"],
  "apikey:write": ["owner", "admin"],
  // Granted by no role. billing.py guards POST /billing/subscription with it,
  // so only owner reaches that route, through the wildcard. Ported as it is:
  // a hosting change that quietly widens a permission is a defect.
  "billing:write": ["owner"],
};

const ROLES = ["owner", "admin", "member", "viewer"];

function principal(role) {
  return makePrincipal(
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    role,
  );
}

describe("the permission matrix", () => {
  for (const [permission, holders] of Object.entries(MATRIX)) {
    for (const role of ROLES) {
      const expected = holders.includes(role);
      it(`${expected ? "grants" : "denies"} ${permission} to ${role}`, () => {
        assert.equal(principal(role).can(permission), expected);
      });
    }
  }
});

describe("the grant lists themselves", () => {
  it("name only permissions the matrix knows", () => {
    // Catches a typo in a grant list, which reads as a permission nobody has
    // and a route nobody can reach.
    const granted = new Set(
      Object.values(ROLE_PERMISSIONS)
        .flat()
        .filter((permission) => permission !== "*"),
    );
    const unknown = [...granted].filter((permission) => !(permission in MATRIX));
    assert.deepEqual(unknown, []);
  });

  it("gives owner the wildcard and nothing else", () => {
    // The wildcard is the whole grant: an owner list that also enumerated
    // permissions would drift from the enumeration next to it.
    assert.deepEqual([...ROLE_PERMISSIONS.owner], ["*"]);
  });

  it("is frozen against a caller that tries to widen it", () => {
    assert.throws(() => ROLE_PERMISSIONS.viewer.push("invoice:write"), TypeError);
    assert.equal(principal("viewer").can("invoice:write"), false);
  });
});
```

- [ ] **Step 2: Run it to verify it passes**

Run from `backend/`:

```bash
node --test tests/permissions.test.js
```

Expected: PASS, 67 tests (64 matrix cells plus 3). This suite asserts against
Task 1's data, so it passes on the first run — that is the point of writing the
data from the spec rather than from the routes.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/permissions.test.js
git commit -m "test: port the permission matrix suite"
```

---

### Task 4: The auth model functions

**Files:**
- Modify: `backend/src/models/auth.js`
- Modify: `backend/src/models/workspaces.js`
- Modify: `backend/src/models/notifications.js`
- Test: `backend/tests/models-auth.test.js`

**Interfaces:**
- Consumes: `withRollback` and the test client from `tests/helpers/database.js` (P1). No application module.
- Produces, from `models/auth.js`:
  - `findUserByEmail(sql, email)` / `findUserById(sql, id)` — a row or `undefined`
  - `insertUser(sql, { id, email, fullName, passwordHash })` — returns the inserted row
  - `findActiveMembership(sql, userId, workspaceId = null)` — `{ workspace_id, workspace_name, role }` or `undefined`
  - `insertWorkspaceMember(sql, { id, workspaceId, userId, role, status })`
  - `insertRefreshToken(sql, { id, userId, tokenHash, expiresAt })`
  - `findRefreshTokenByHash(sql, tokenHash)` / `findRefreshTokenById(sql, id)`
  - `revokeRefreshToken(sql, id, revokedAt)`
  - `setRefreshTokenReplacedBy(sql, id, replacedById)`
- Produces, from `models/workspaces.js`: `insertWorkspace(sql, { id, name, slug })` returning the row, `findWorkspaceById(sql, id)`
- Produces, from `models/notifications.js`: `REMINDER_TEMPLATES`, `insertEmailTemplates(sql, workspaceId)`

Two conventions, applied here and for the rest of the port:

**The handle is the first argument.** It is the pool in production and a
transaction in a test, and a model function cannot tell the difference. Spec §5
asks for the workspace id first; in JavaScript there is no repository object to
hold a session, so the handle takes that place and the workspace id follows it.

**Rows come back with their column names.** `full_name`, not `fullName`.
The wire shapes in `src/lib/api/session.ts` are snake_case too, so a row is
nearly the response already, and a mapping layer would exist only to be
maintained. Parameters, being JavaScript locals, stay camelCase.

The three reminder templates move from `app/services/auth.py` to
`models/notifications.js`, which is the file that already declares it owns
`email_templates`. The copy is unchanged.

The Python service flushed parents before children because none of those models
declared a `relationship()`, so the unit of work could order the INSERTs wrong.
Raw SQL has no unit of work: statements run in the order they are written, and
that comment does not port.

- [ ] **Step 1: Write the failing model test**

Create `backend/tests/models-auth.test.js`:

```js
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

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
} from "../src/models/auth.js";
import {
  REMINDER_TEMPLATES,
  insertEmailTemplates,
} from "../src/models/notifications.js";
import { findWorkspaceById, insertWorkspace } from "../src/models/workspaces.js";
import { withRollback } from "./helpers/database.js";

function newUser(overrides = {}) {
  return {
    id: randomUUID(),
    email: `${randomUUID()}@example.test`,
    fullName: "Ada Lovelace",
    passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA",
    ...overrides,
  };
}

function newWorkspace(overrides = {}) {
  const id = randomUUID();
  return { id, name: "Ada's workspace", slug: `ada-${id.slice(0, 8)}`, ...overrides };
}

describe("users", () => {
  it("round trips by id and by email", async () => {
    await withRollback(async (tx) => {
      const input = newUser();
      const inserted = await insertUser(tx, input);

      assert.equal(inserted.email, input.email);
      assert.equal(inserted.full_name, "Ada Lovelace");
      assert.equal(inserted.avatar_url, null);
      assert.equal((await findUserById(tx, input.id)).id, input.id);
      assert.equal((await findUserByEmail(tx, input.email)).id, input.id);
    });
  });

  it("finds an email whatever its case", async () => {
    // uq_users_email_lower indexes LOWER(email), and login lower-cases before
    // it looks. A case-sensitive lookup here would let one address sign up
    // twice and then fail to log either of them in.
    await withRollback(async (tx) => {
      const input = newUser({ email: "Ada@Example.test" });
      await insertUser(tx, input);
      assert.ok(await findUserByEmail(tx, "ada@example.test"));
      assert.ok(await findUserByEmail(tx, "ADA@EXAMPLE.TEST"));
    });
  });

  it("answers undefined for an email nobody has", async () => {
    await withRollback(async (tx) => {
      assert.equal(await findUserByEmail(tx, "nobody@example.test"), undefined);
    });
  });
});

describe("memberships", () => {
  it("returns the workspace, its name and the role", async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx, newUser());
      const workspace = await insertWorkspace(tx, newWorkspace());
      await insertWorkspaceMember(tx, {
        id: randomUUID(),
        workspaceId: workspace.id,
        userId: user.id,
        role: "owner",
        status: "active",
      });

      const membership = await findActiveMembership(tx, user.id);
      assert.equal(membership.workspace_id, workspace.id);
      assert.equal(membership.workspace_name, "Ada's workspace");
      assert.equal(membership.role, "owner");
    });
  });

  it("ignores a membership that is only invited", async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx, newUser());
      const workspace = await insertWorkspace(tx, newWorkspace());
      await insertWorkspaceMember(tx, {
        id: randomUUID(),
        workspaceId: workspace.id,
        userId: user.id,
        role: "member",
        status: "invited",
      });
      assert.equal(await findActiveMembership(tx, user.id), undefined);
    });
  });

  it("prefers the oldest active membership", async () => {
    // A returning user lands in the workspace they think of as theirs, not
    // whichever one was created last.
    await withRollback(async (tx) => {
      const user = await insertUser(tx, newUser());
      const first = await insertWorkspace(tx, newWorkspace({ name: "First" }));
      const second = await insertWorkspace(tx, newWorkspace({ name: "Second" }));
      await insertWorkspaceMember(tx, {
        id: randomUUID(),
        workspaceId: first.id,
        userId: user.id,
        role: "owner",
        status: "active",
      });
      await tx`
        UPDATE workspace_members
        SET created_at = now() - interval '1 day'
        WHERE workspace_id = ${first.id}
      `;
      await insertWorkspaceMember(tx, {
        id: randomUUID(),
        workspaceId: second.id,
        userId: user.id,
        role: "viewer",
        status: "active",
      });

      assert.equal((await findActiveMembership(tx, user.id)).workspace_id, first.id);
    });
  });

  it("narrows to one workspace when asked for one", async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx, newUser());
      const first = await insertWorkspace(tx, newWorkspace());
      const second = await insertWorkspace(tx, newWorkspace({ name: "Client co" }));
      for (const [workspace, role] of [[first, "owner"], [second, "viewer"]]) {
        await insertWorkspaceMember(tx, {
          id: randomUUID(),
          workspaceId: workspace.id,
          userId: user.id,
          role,
          status: "active",
        });
      }

      const membership = await findActiveMembership(tx, user.id, second.id);
      // The role travels with the workspace: an owner elsewhere is a viewer here.
      assert.equal(membership.role, "viewer");
      assert.equal(
        await findActiveMembership(tx, user.id, randomUUID()),
        undefined,
      );
    });
  });
});

describe("refresh tokens", () => {
  async function seedToken(tx, overrides = {}) {
    const user = await insertUser(tx, newUser());
    const row = {
      id: randomUUID(),
      userId: user.id,
      tokenHash: randomUUID().replaceAll("-", "").repeat(2),
      expiresAt: new Date(Date.now() + 86_400_000),
      ...overrides,
    };
    await insertRefreshToken(tx, row);
    return row;
  }

  it("round trips by hash and by id", async () => {
    await withRollback(async (tx) => {
      const row = await seedToken(tx);
      const found = await findRefreshTokenByHash(tx, row.tokenHash);
      assert.equal(found.id, row.id);
      assert.equal(found.revoked_at, null);
      assert.equal(found.replaced_by_id, null);
      assert.ok(found.expires_at instanceof Date);
      assert.equal((await findRefreshTokenById(tx, row.id)).id, row.id);
    });
  });

  it("records a revocation and a replacement", async () => {
    await withRollback(async (tx) => {
      const older = await seedToken(tx);
      const newer = await seedToken(tx);
      const revokedAt = new Date();

      await revokeRefreshToken(tx, older.id, revokedAt);
      await setRefreshTokenReplacedBy(tx, older.id, newer.id);

      const row = await findRefreshTokenById(tx, older.id);
      assert.equal(row.revoked_at.getTime(), revokedAt.getTime());
      assert.equal(row.replaced_by_id, newer.id);
    });
  });

  it("answers undefined for a hash nobody issued", async () => {
    await withRollback(async (tx) => {
      assert.equal(await findRefreshTokenByHash(tx, "0".repeat(64)), undefined);
    });
  });
});

describe("email templates", () => {
  it("seeds the three tones a workspace starts with", async () => {
    await withRollback(async (tx) => {
      const workspace = await insertWorkspace(tx, newWorkspace());
      await insertEmailTemplates(tx, workspace.id);

      const rows = await tx`
        SELECT tone, subject FROM email_templates
        WHERE workspace_id = ${workspace.id} ORDER BY tone
      `;
      assert.deepEqual(
        rows.map((row) => row.tone),
        ["final", "firm", "friendly"],
      );
      assert.equal(rows.length, REMINDER_TEMPLATES.length);
      assert.ok(rows.every((row) => row.subject.includes("{invoice_number}")));
    });
  });
});

describe("workspaces", () => {
  it("round trips by id", async () => {
    await withRollback(async (tx) => {
      const workspace = await insertWorkspace(tx, newWorkspace());
      const found = await findWorkspaceById(tx, workspace.id);
      assert.equal(found.name, "Ada's workspace");
      assert.equal(await findWorkspaceById(tx, randomUUID()), undefined);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run from `backend/`:

```bash
node --test tests/models-auth.test.js
```

Expected: FAIL — `models/auth.js` exports none of these names, so the import
throws `SyntaxError: The requested module ... does not provide an export named
'findUserByEmail'`.

- [ ] **Step 3: Write the auth model**

Replace `backend/src/models/auth.js` with:

```js
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
```

- [ ] **Step 4: Write the workspace and template models**

Replace `backend/src/models/workspaces.js` with:

```js
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
```

Replace `backend/src/models/notifications.js` with:

```js
/**
 * Notifications. Owns: communication_logs, email_templates.
 *
 * The templates are seeded per workspace at signup so the first reminder has
 * copy to send. An empty template table means the send path has to invent one.
 * Placeholders are the tokens the reminder service substitutes.
 *
 * Ported from the TEMPLATES tuple in app/services/auth.py.
 */
import { randomUUID } from "node:crypto";

export const REMINDER_TEMPLATES = Object.freeze([
  Object.freeze({
    name: "Friendly nudge",
    tone: "friendly",
    subject: "A quick note about invoice {invoice_number}",
    body:
      "Hi {contact_name},\n\nInvoice {invoice_number} for {amount} was due on " +
      "{due_date}. If it is already on its way, thank you -- please ignore " +
      "this note.\n\n{payment_link}\n\nBest,\n{sender_name}",
  }),
  Object.freeze({
    name: "Firm reminder",
    tone: "firm",
    subject: "Invoice {invoice_number} is {days_overdue} days overdue",
    body:
      "Hi {contact_name},\n\nInvoice {invoice_number} for {amount} was due on " +
      "{due_date} and is now {days_overdue} days overdue. Could you confirm " +
      "when we can expect payment?\n\n{payment_link}\n\nThanks,\n{sender_name}",
  }),
  Object.freeze({
    name: "Final notice",
    tone: "final",
    subject: "Final notice: invoice {invoice_number}",
    body:
      "Hi {contact_name},\n\nInvoice {invoice_number} for {amount} remains " +
      "unpaid {days_overdue} days after its due date. Please arrange payment " +
      "within five business days so we can keep your account in good " +
      "standing.\n\n{payment_link}\n\nRegards,\n{sender_name}",
  }),
]);

export async function insertEmailTemplates(sql, workspaceId) {
  await sql`
    INSERT INTO email_templates ${sql(
      REMINDER_TEMPLATES.map((template) => ({
        id: randomUUID(),
        workspace_id: workspaceId,
        name: template.name,
        tone: template.tone,
        subject: template.subject,
        body: template.body,
      })),
    )}
  `;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run from `backend/`:

```bash
node --test tests/models-auth.test.js
```

Expected: PASS, 12 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/models/auth.js backend/src/models/workspaces.js backend/src/models/notifications.js backend/tests/models-auth.test.js
git commit -m "feat: add the auth, workspace and template model functions"
```

---

### Task 5: The auth service — signup and login

**Files:**
- Create: `backend/src/services/auth.js`
- Test: `backend/tests/auth-service.test.js`

**Interfaces:**
- Consumes: everything from Tasks 1 and 4, plus `Conflict` and `AuthenticationFailed` from `middleware/errors.js`.
- Produces:
  - `signup(sql, config, body)` — `body` is the wire shape `{ full_name, email, password }`. Returns `{ tokens, user }`.
  - `login(sql, config, body)` — `body` is `{ email, password }`. Returns `{ tokens, user }`.
  - The `AuthResult` shape, which every auth endpoint answers with:
    `{ tokens: { access_token, refresh_token, expires_in }, user: { id, email, full_name, avatar_url, workspace_id, workspace_name, role } }`

These are functions, not a class. `AuthService(session)` existed to carry the
session; here the handle is already the first argument.

**No function in this file opens a transaction** — see "Transactions: who opens
them" above. Signup is wrapped by its controller because a half-created
workspace with no owner is worse than a failed signup. Login writes one row and
needs no wrapper.

- [ ] **Step 1: Write the failing signup and login tests**

Create `backend/tests/auth-service.test.js`:

```js
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { Conflict } from "../src/middleware/errors.js";
import { decodeAccessToken } from "../src/lib/security.js";
import { login, signup } from "../src/services/auth.js";
import { withRollback } from "./helpers/database.js";

const CONFIG = {
  environment: "test",
  port: 0,
  databaseUrl: "postgresql://unused",
  secretKey: "test-only-key-that-is-long-enough-for-hs256",
};

const PASSWORD = "correct-horse-1";

function signupBody(overrides = {}) {
  return {
    full_name: "Ada Lovelace",
    email: `ada-${randomUUID().slice(0, 8)}@example.test`,
    password: PASSWORD,
    ...overrides,
  };
}

describe("signup", () => {
  it("creates a workspace owned by the new user", async () => {
    await withRollback(async (tx) => {
      const body = signupBody();
      const result = await signup(tx, CONFIG, body);

      assert.equal(result.user.email, body.email);
      assert.equal(result.user.role, "owner");

      const [member] = await tx`
        SELECT role, status FROM workspace_members
        WHERE workspace_id = ${result.user.workspace_id}
      `;
      assert.equal(member.role, "owner");
      assert.equal(member.status, "active");
    });
  });

  it("never stores the password", async () => {
    await withRollback(async (tx) => {
      const body = signupBody();
      await signup(tx, CONFIG, body);
      const [user] = await tx`
        SELECT password_hash FROM users WHERE email = ${body.email}
      `;
      assert.ok(!user.password_hash.includes(PASSWORD));
      assert.ok(user.password_hash.startsWith("$argon2"));
    });
  });

  it("seeds the three reminder templates", async () => {
    await withRollback(async (tx) => {
      const result = await signup(tx, CONFIG, signupBody());
      const rows = await tx`
        SELECT tone FROM email_templates
        WHERE workspace_id = ${result.user.workspace_id}
      `;
      assert.deepEqual(
        new Set(rows.map((row) => row.tone)),
        new Set(["friendly", "firm", "final"]),
      );
    });
  });

  it("issues a usable token pair", async () => {
    await withRollback(async (tx) => {
      const result = await signup(tx, CONFIG, signupBody());
      const principal = await decodeAccessToken(
        result.tokens.access_token,
        CONFIG.secretKey,
      );
      assert.equal(principal.workspaceId, result.user.workspace_id);
      assert.equal(principal.role, "owner");
      assert.equal(result.tokens.expires_in, 30 * 60);
    });
  });

  it("stores the refresh token only as a hash", async () => {
    await withRollback(async (tx) => {
      const result = await signup(tx, CONFIG, signupBody());
      const [row] = await tx`SELECT token_hash FROM refresh_tokens`;
      assert.equal(row.token_hash.length, 64);
      assert.notEqual(row.token_hash, result.tokens.refresh_token);
    });
  });

  it("refuses a second signup on one email, whatever its case", async () => {
    // Signup can say this; login cannot. A signup form that accepted a
    // duplicate silently would strand the person on a login they have no
    // password for.
    await withRollback(async (tx) => {
      const body = signupBody({ email: "ada@example.test" });
      await signup(tx, CONFIG, body);
      await assert.rejects(
        () => signup(tx, CONFIG, { ...body, email: "Ada@Example.test" }),
        Conflict,
      );
    });
  });

  it("gives two people with one first name different slugs", async () => {
    // Without the suffix the second signup dies on the unique constraint,
    // which reads to the person as "signup is broken".
    await withRollback(async (tx) => {
      const first = await signup(tx, CONFIG, signupBody());
      const second = await signup(tx, CONFIG, signupBody());
      assert.notEqual(first.user.workspace_id, second.user.workspace_id);

      const rows = await tx`
        SELECT slug FROM workspaces
        WHERE id IN (${first.user.workspace_id}, ${second.user.workspace_id})
      `;
      const slugs = rows.map((row) => row.slug);
      assert.equal(new Set(slugs).size, 2);
      assert.ok(slugs.every((slug) => slug.startsWith("ada-s-workspace-")));
    });
  });
});

describe("login", () => {
  it("returns a session for the right password", async () => {
    await withRollback(async (tx) => {
      const body = signupBody();
      await signup(tx, CONFIG, body);
      const result = await login(tx, CONFIG, {
        email: body.email,
        password: PASSWORD,
      });
      assert.equal(result.user.email, body.email);
      assert.equal(result.user.role, "owner");
    });
  });

  it("is case insensitive on the email", async () => {
    await withRollback(async (tx) => {
      const body = signupBody({ email: "ada@example.test" });
      await signup(tx, CONFIG, body);
      const result = await login(tx, CONFIG, {
        email: "ADA@example.test",
        password: PASSWORD,
      });
      assert.equal(result.user.email, "ada@example.test");
    });
  });

  it("fails identically for a wrong password and an unknown email", async () => {
    // Identical type and message. Anything that distinguishes the two turns
    // this endpoint into a list of which emails have accounts.
    await withRollback(async (tx) => {
      const body = signupBody();
      await signup(tx, CONFIG, body);

      const details = [];
      for (const attempt of [
        { email: body.email, password: "wrong-guess-99" },
        { email: "nobody@example.test", password: "wrong-guess-99" },
      ]) {
        await login(tx, CONFIG, attempt).catch((error) =>
          details.push([error.status, error.detail]),
        );
      }
      assert.deepEqual(details, [
        [401, "Invalid credentials"],
        [401, "Invalid credentials"],
      ]);
    });
  });

  it("still verifies a hash when the email is unknown", async () => {
    // The timing half of the same defence: returning without hashing would
    // answer in a millisecond while a real account took argon2's ~300ms, and
    // the clock would leak the answer. Measured rather than mocked -- the
    // assertion is that the unknown-email path is not an order of magnitude
    // faster than the wrong-password one.
    await withRollback(async (tx) => {
      const body = signupBody();
      await signup(tx, CONFIG, body);

      const elapsed = async (attempt) => {
        const started = process.hrtime.bigint();
        await login(tx, CONFIG, attempt).catch(() => {});
        return Number(process.hrtime.bigint() - started) / 1e6;
      };

      const wrongPassword = await elapsed({
        email: body.email,
        password: "wrong-guess-99",
      });
      const unknownEmail = await elapsed({
        email: "nobody@example.test",
        password: "wrong-guess-99",
      });
      assert.ok(
        unknownEmail > wrongPassword / 4,
        `unknown email answered in ${unknownEmail}ms against ${wrongPassword}ms`,
      );
    });
  });

  it("refuses a user whose only membership was revoked", async () => {
    // Valid credentials and no workspace to enter. Issuing a token with no
    // workspace would be a token every query then filters against nothing.
    await withRollback(async (tx) => {
      const body = signupBody();
      const result = await signup(tx, CONFIG, body);
      await tx`
        UPDATE workspace_members SET status = 'invited'
        WHERE workspace_id = ${result.user.workspace_id}
      `;
      await assert.rejects(
        () => login(tx, CONFIG, { email: body.email, password: PASSWORD }),
        (error) => error.status === 401,
      );
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run from `backend/`:

```bash
node --test tests/auth-service.test.js
```

Expected: FAIL with `Cannot find module` for `../src/services/auth.js`.

- [ ] **Step 3: Write signup, login, and the shared issue step**

Create `backend/src/services/auth.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `backend/`:

```bash
node --test tests/auth-service.test.js
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/auth.js backend/tests/auth-service.test.js
git commit -m "feat: port signup and login onto the auth service"
```

---

### Task 6: The auth service — refresh, logout, switch and describe

**Files:**
- Modify: `backend/src/services/auth.js`
- Modify: `backend/tests/auth-service.test.js`

**Interfaces:**
- Consumes: Task 5's `issue`, plus `findRefreshTokenByHash`, `findRefreshTokenById`, `findUserById`, `revokeRefreshToken`, `setRefreshTokenReplacedBy` from Task 4 and `findWorkspaceById` from Task 4.
- Produces:
  - `refresh(sql, config, token)` — returns an `AuthResult`; rotates the presented token
  - `logout(sql, token)` — returns `undefined`, and is not an error for a session that is already over
  - `switchWorkspace(sql, config, principal, workspaceId)` — returns an `AuthResult` for the new scope, or throws `NotFound`
  - `describe(sql, principal)` — returns the `user` half of an `AuthResult`

**Why `refresh` is not wrapped in a transaction.** When a revoked token is
presented, every session descended from it is suspect, so the whole chain is
revoked — and *then* the request fails with a 401. If the controller had opened
a transaction, the throw would roll the revocation back and leave the thief's
newer token alive, which is the one that matters. The statements therefore run
directly on the handle, committing as they go, exactly as `AuthService.refresh`
committed before it raised.

The cost is a window on the happy path: if the process dies between the insert
of the new row and the revocation of the old, both tokens are briefly valid.
That widens nothing an attacker can use — the old token was valid a moment ago
anyway — and the next use of either is what the reuse detector is for.

- [ ] **Step 1: Write the failing rotation tests**

Append to `backend/tests/auth-service.test.js`. Add `hashRefreshToken` to the
existing import from `../src/lib/security.js`, then add these imports and the
rest of the block:

```js
import { NotFound } from "../src/middleware/errors.js";
import {
  describe as describeSession,
  logout,
  refresh,
  switchWorkspace,
} from "../src/services/auth.js";
import {
  findRefreshTokenByHash,
  insertWorkspaceMember,
} from "../src/models/auth.js";
import { insertWorkspace } from "../src/models/workspaces.js";

// `describe` is node:test's here, so the service's is imported as
// describeSession above.
async function principalFor(result) {
  return decodeAccessToken(result.tokens.access_token, CONFIG.secretKey);
}

describe("refresh", () => {
  it("issues a new pair and retires the old one", async () => {
    await withRollback(async (tx) => {
      const first = (await signup(tx, CONFIG, signupBody())).tokens;
      const second = (await refresh(tx, CONFIG, first.refresh_token)).tokens;

      assert.notEqual(second.refresh_token, first.refresh_token);
      const old = await findRefreshTokenByHash(
        tx,
        hashRefreshToken(first.refresh_token),
      );
      assert.notEqual(old.revoked_at, null);
      assert.notEqual(old.replaced_by_id, null);
    });
  });

  it("kills the whole chain when a retired token comes back", async () => {
    // A revoked token being presented means it leaked. Revoking only that row
    // would leave the thief's newer token alive.
    await withRollback(async (tx) => {
      const first = (await signup(tx, CONFIG, signupBody())).tokens;
      const second = (await refresh(tx, CONFIG, first.refresh_token)).tokens;
      const third = (await refresh(tx, CONFIG, second.refresh_token)).tokens;

      await assert.rejects(
        () => refresh(tx, CONFIG, first.refresh_token),
        (error) => error.status === 401,
      );

      for (const tokens of [first, second, third]) {
        const row = await findRefreshTokenByHash(
          tx,
          hashRefreshToken(tokens.refresh_token),
        );
        assert.notEqual(row.revoked_at, null, tokens.refresh_token);
      }
    });
  });

  it("rejects a token nobody issued", async () => {
    await withRollback(async (tx) => {
      await assert.rejects(
        () => refresh(tx, CONFIG, "not-a-real-token"),
        (error) => error.status === 401,
      );
    });
  });

  it("rejects an expired token", async () => {
    await withRollback(async (tx) => {
      const tokens = (await signup(tx, CONFIG, signupBody())).tokens;
      await tx`UPDATE refresh_tokens SET expires_at = now() - interval '1 day'`;
      await assert.rejects(
        () => refresh(tx, CONFIG, tokens.refresh_token),
        (error) => error.status === 401,
      );
    });
  });
});

describe("logout", () => {
  it("revokes the presented token and no other", async () => {
    await withRollback(async (tx) => {
      const mine = (await signup(tx, CONFIG, signupBody())).tokens;
      const theirs = (await signup(tx, CONFIG, signupBody())).tokens;

      await logout(tx, mine.refresh_token);

      const revoked = await findRefreshTokenByHash(
        tx,
        hashRefreshToken(mine.refresh_token),
      );
      const untouched = await findRefreshTokenByHash(
        tx,
        hashRefreshToken(theirs.refresh_token),
      );
      assert.notEqual(revoked.revoked_at, null);
      assert.equal(untouched.revoked_at, null);
    });
  });

  it("is not an error twice, or for a token nobody issued", async () => {
    // The Server Action clears cookies and calls this; a second click must not
    // produce a 401 page for someone who is already signed out.
    await withRollback(async (tx) => {
      const tokens = (await signup(tx, CONFIG, signupBody())).tokens;
      await logout(tx, tokens.refresh_token);
      await logout(tx, tokens.refresh_token);
      await logout(tx, "not-a-real-token");
    });
  });
});

describe("switchWorkspace", () => {
  it("issues a token for the new scope, with the role it carries there", async () => {
    await withRollback(async (tx) => {
      const result = await signup(tx, CONFIG, signupBody());
      const principal = await principalFor(result);

      const other = await insertWorkspace(tx, {
        id: randomUUID(),
        name: "Client co",
        slug: `client-${randomUUID().slice(0, 8)}`,
      });
      await insertWorkspaceMember(tx, {
        id: randomUUID(),
        workspaceId: other.id,
        userId: principal.userId,
        role: "viewer",
        status: "active",
      });

      const switched = await switchWorkspace(tx, CONFIG, principal, other.id);
      const after = await principalFor(switched);
      assert.equal(after.workspaceId, other.id);
      // The role travels with the workspace: an owner elsewhere is a viewer here.
      assert.equal(after.role, "viewer");
      assert.equal(switched.user.workspace_name, "Client co");
    });
  });

  it("answers not found for a workspace you do not belong to", async () => {
    // 404 rather than 403: a 403 confirms that workspace id exists.
    await withRollback(async (tx) => {
      const principal = await principalFor(await signup(tx, CONFIG, signupBody()));
      await assert.rejects(
        () => switchWorkspace(tx, CONFIG, principal, randomUUID()),
        NotFound,
      );
    });
  });
});

describe("describe", () => {
  it("renders the principal as the session the shell is built from", async () => {
    await withRollback(async (tx) => {
      const body = signupBody();
      const result = await signup(tx, CONFIG, body);
      const session = await describeSession(tx, await principalFor(result));

      assert.deepEqual(session, {
        id: result.user.id,
        email: body.email,
        full_name: "Ada Lovelace",
        avatar_url: null,
        workspace_id: result.user.workspace_id,
        workspace_name: "Ada's workspace",
        role: "owner",
      });
    });
  });

  it("refuses a principal whose user is gone", async () => {
    await withRollback(async (tx) => {
      const principal = await principalFor(await signup(tx, CONFIG, signupBody()));
      await tx`DELETE FROM users WHERE id = ${principal.userId}`;
      await assert.rejects(
        () => describeSession(tx, principal),
        (error) => error.status === 401,
      );
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run from `backend/`:

```bash
node --test tests/auth-service.test.js
```

Expected: FAIL — `services/auth.js` provides no export named `refresh`.

- [ ] **Step 3: Write the rotation half of the service**

Add to `backend/src/services/auth.js` — extend the existing imports and append
the functions:

```js
// Add NotFound to the existing import from ../middleware/errors.js.
// Add findRefreshTokenById, findRefreshTokenByHash, findUserById,
//   revokeRefreshToken and setRefreshTokenReplacedBy to the existing import
//   from ../models/auth.js.
// Add findWorkspaceById to the existing import from ../models/workspaces.js.

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `backend/`:

```bash
node --test tests/auth-service.test.js
```

Expected: PASS, 22 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/auth.js backend/tests/auth-service.test.js
git commit -m "feat: rotate, revoke and switch sessions on the auth service"
```

---

### Task 7: The auth and users endpoints

**Files:**
- Modify: `backend/src/middleware/errors.js` (add `NotImplemented`)
- Modify: `backend/src/db/index.js` (add `transaction`)
- Create: `backend/src/controllers/auth.js`
- Create: `backend/src/controllers/users.js`
- Create: `backend/src/controllers/not-implemented.js`
- Create: `backend/src/routes/auth.js`
- Create: `backend/src/routes/users.js`
- Modify: `backend/src/app.js`
- Modify: `backend/src/server.js`
- Create: `backend/tests/helpers/app.js`
- Test: `backend/tests/auth-routes.test.js`
- Modify: `backend/tests/errors.test.js`, `backend/tests/health.test.js`

**Interfaces:**
- Consumes: the whole auth service (Tasks 5, 6), `authenticate` (Task 2), `getSql` and `createApp` from P1.
- Produces:
  - `NotImplemented` — a `DomainError` with `status = 501`, default detail `Not implemented`
  - `transaction(sql, fn)` — runs `fn` in a transaction, or in a savepoint when the handle already is one
  - `notImplemented(request, response)` — the shared stub handler, in `controllers/not-implemented.js`
  - `authController(sql, config)` / `usersController(sql)` — objects of Express handlers
  - `authRouter(sql, config)` / `usersRouter(sql, config)` — mounted at `/api/auth` and `/api/users`
  - `createApp(config, sql)` — **signature change**: the second argument is the database handle the routers close over

The six endpoints that do real work are all here: `POST /api/auth/signup`,
`login`, `refresh`, `logout`, `switch-workspace`, and `GET /api/users/me`.
`POST /api/auth/password-reset` and `PATCH /api/users/me` are stubs, and
password-reset carries no guard at all — matching `app/api/routes/auth.py:56`,
which takes no dependency and answers 501 to an anonymous caller.

Request schemas live at the top of `controllers/auth.js` rather than in a
`schemas/` directory: there are four of them, they have exactly one consumer,
and a directory holding fifteen lines is a directory to navigate for nothing.

- [ ] **Step 1: Add `NotImplemented` and `transaction`**

In `backend/src/middleware/errors.js`, after the `Conflict` class:

```js
/**
 * A route that exists, is guarded, and has no service behind it yet. Fifty of
 * them shipped with this port so the endpoint surface matches the Python
 * service on the day it is deleted.
 */
export class NotImplemented extends DomainError {
  static status = 501;
  static defaultDetail = "Not implemented";
}
```

In `backend/src/db/index.js`, at the end:

```js
/**
 * Run `fn` in a transaction -- or in a savepoint, when the handle already is
 * one.
 *
 * postgres.js gives a transaction callback a handle carrying .savepoint and no
 * .begin (src/index.js:250-253), so a controller that called sql.begin would
 * throw the moment a test handed it the rollback transaction. One line here is
 * what lets the controller read the same either way.
 */
export function transaction(sql, fn) {
  return sql.begin ? sql.begin(fn) : sql.savepoint(fn);
}
```

Add to `backend/tests/errors.test.js`, inside the `"the domain error hierarchy"`
describe block:

```js
  it("carries a 501 for a route with nothing behind it", () => {
    assert.equal(new NotImplemented().status, 501);
    assert.equal(
      new NotImplemented("Not implemented: nothing yet.").detail,
      "Not implemented: nothing yet.",
    );
  });
```

and add `NotImplemented` to that file's import from `../src/middleware/errors.js`.

- [ ] **Step 2: Write the test harness for a listening app**

Create `backend/tests/helpers/app.js`:

```js
/**
 * A listening app bound to one rolled-back transaction.
 *
 * The handle passed to createApp is the test's transaction, so every request
 * the app serves writes inside it and nothing survives the test. Equivalent to
 * the dependency_overrides[get_session] trick in the Python conftest.
 *
 * The server is started and stopped per test. closeAllConnections() is not
 * optional: global fetch keeps its sockets alive, and server.close() alone
 * waits for them forever.
 */
import { createApp } from "../../src/app.js";
import { withRollback } from "./database.js";

export const TEST_CONFIG = Object.freeze({
  environment: "test",
  port: 0,
  databaseUrl: "postgresql://unused",
  secretKey: "test-only-key-that-is-long-enough-for-hs256",
});

export async function withApp(fn) {
  return withRollback(async (tx) => {
    const server = createApp(TEST_CONFIG, tx).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;

    async function send(method, path, { body, token } = {}) {
      const response = await fetch(`${origin}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        body: text === "" ? null : JSON.parse(text),
      };
    }

    try {
      return await fn({ send, tx });
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
}
```

- [ ] **Step 3: Write the failing auth route test**

Create `backend/tests/auth-routes.test.js`:

```js
/**
 * The auth endpoints through the real Express app.
 *
 * Status codes and response shape only -- the rules themselves are tested in
 * auth-service.test.js, and repeating them here would double the maintenance
 * without doubling the coverage.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { withApp } from "./helpers/app.js";

const SIGNUP = {
  full_name: "Ada Lovelace",
  email: "ada@example.test",
  password: "correct-horse-1",
};

describe("POST /api/auth/signup", () => {
  it("answers 201 with tokens and a user", async () => {
    await withApp(async ({ send }) => {
      const response = await send("POST", "/api/auth/signup", { body: SIGNUP });
      assert.equal(response.status, 201);
      assert.ok(response.body.tokens.access_token);
      assert.equal(response.body.tokens.expires_in, 1800);
      assert.equal(response.body.user.role, "owner");
      // The password must not come back in any form.
      assert.ok(!JSON.stringify(response.body).includes(SIGNUP.password));
    });
  });

  it("answers 409 for a duplicate", async () => {
    await withApp(async ({ send }) => {
      await send("POST", "/api/auth/signup", { body: SIGNUP });
      const response = await send("POST", "/api/auth/signup", { body: SIGNUP });
      assert.equal(response.status, 409);
      assert.equal(response.body.detail, "An account with that email already exists");
    });
  });

  it("answers 422 for a short password, a bad email or a missing field", async () => {
    await withApp(async ({ send }) => {
      for (const body of [
        { ...SIGNUP, password: "short" },
        { ...SIGNUP, email: "not-an-email" },
        { full_name: "Ada Lovelace" },
      ]) {
        const response = await send("POST", "/api/auth/signup", { body });
        assert.equal(response.status, 422, JSON.stringify(body));
        assert.equal(response.body.detail, "Invalid request");
      }
    });
  });

  it("rolls the whole signup back when one statement fails", async () => {
    // A half-created workspace with no owner is worse than a failed signup,
    // which is the one use case here wrapped in a transaction.
    await withApp(async ({ send, tx }) => {
      await send("POST", "/api/auth/signup", { body: SIGNUP });
      const before = await tx`SELECT count(*)::int AS n FROM users`;
      const response = await send("POST", "/api/auth/signup", { body: SIGNUP });
      const after = await tx`SELECT count(*)::int AS n FROM users`;

      assert.equal(response.status, 409);
      assert.equal(after[0].n, before[0].n);
    });
  });
});

describe("POST /api/auth/login", () => {
  it("answers 200, and 401 for a bad password", async () => {
    await withApp(async ({ send }) => {
      await send("POST", "/api/auth/signup", { body: SIGNUP });

      const good = await send("POST", "/api/auth/login", {
        body: { email: SIGNUP.email, password: SIGNUP.password },
      });
      assert.equal(good.status, 200);

      const bad = await send("POST", "/api/auth/login", {
        body: { email: SIGNUP.email, password: "wrong-guess-99" },
      });
      assert.equal(bad.status, 401);
      assert.equal(bad.body.detail, "Invalid credentials");
      assert.equal(bad.headers.get("www-authenticate"), "Bearer");
    });
  });
});

describe("POST /api/auth/refresh and /logout", () => {
  it("rotates, then ends the session with 204", async () => {
    await withApp(async ({ send }) => {
      const created = await send("POST", "/api/auth/signup", { body: SIGNUP });

      const refreshed = await send("POST", "/api/auth/refresh", {
        body: { refresh_token: created.body.tokens.refresh_token },
      });
      assert.equal(refreshed.status, 200);
      assert.notEqual(
        refreshed.body.tokens.refresh_token,
        created.body.tokens.refresh_token,
      );

      const out = await send("POST", "/api/auth/logout", {
        body: { refresh_token: refreshed.body.tokens.refresh_token },
      });
      assert.equal(out.status, 204);
      assert.equal(out.body, null);
    });
  });

  it("answers 401 for a refresh token nobody issued", async () => {
    await withApp(async ({ send }) => {
      const response = await send("POST", "/api/auth/refresh", {
        body: { refresh_token: "not-a-real-token" },
      });
      assert.equal(response.status, 401);
    });
  });
});

describe("POST /api/auth/switch-workspace", () => {
  it("answers 401 without a bearer token", async () => {
    // Python answered 403 here, because HTTPBearer(auto_error=True) raises
    // 403 for an absent header. 401 is what RFC 7235 specifies and what
    // src/lib/api/session.ts reads as "signed out".
    await withApp(async ({ send }) => {
      const response = await send("POST", "/api/auth/switch-workspace", {
        body: { workspace_id: randomUUID() },
      });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("www-authenticate"), "Bearer");
    });
  });

  it("answers 404 for a workspace the caller does not belong to", async () => {
    await withApp(async ({ send }) => {
      const created = await send("POST", "/api/auth/signup", { body: SIGNUP });
      const response = await send("POST", "/api/auth/switch-workspace", {
        token: created.body.tokens.access_token,
        body: { workspace_id: randomUUID() },
      });
      assert.equal(response.status, 404);
    });
  });

  it("answers 422 for a workspace id that is not a uuid", async () => {
    await withApp(async ({ send }) => {
      const created = await send("POST", "/api/auth/signup", { body: SIGNUP });
      const response = await send("POST", "/api/auth/switch-workspace", {
        token: created.body.tokens.access_token,
        body: { workspace_id: "../../etc/passwd" },
      });
      assert.equal(response.status, 422);
    });
  });
});

describe("GET /api/users/me", () => {
  it("returns the signed-in user in the token's workspace", async () => {
    await withApp(async ({ send }) => {
      const created = await send("POST", "/api/auth/signup", { body: SIGNUP });
      const response = await send("GET", "/api/users/me", {
        token: created.body.tokens.access_token,
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.email, SIGNUP.email);
      assert.equal(response.body.workspace_id, created.body.user.workspace_id);
      // The shape sessionUserSchema in src/lib/api/session.ts parses.
      assert.deepEqual(Object.keys(response.body).sort(), [
        "avatar_url",
        "email",
        "full_name",
        "id",
        "role",
        "workspace_id",
        "workspace_name",
      ]);
    });
  });

  it("answers 401 without a token and with a forged one", async () => {
    await withApp(async ({ send }) => {
      assert.equal((await send("GET", "/api/users/me")).status, 401);
      assert.equal(
        (await send("GET", "/api/users/me", { token: "neither.a.jwt" })).status,
        401,
      );
    });
  });
});

describe("POST /api/auth/password-reset", () => {
  it("answers 501 to an anonymous caller", async () => {
    // Guarded by nothing, exactly as app/api/routes/auth.py:56 is.
    await withApp(async ({ send }) => {
      const response = await send("POST", "/api/auth/password-reset", { body: {} });
      assert.equal(response.status, 501);
      assert.equal(
        response.body.detail,
        "Not implemented: password reset needs the outbox from plan 4.",
      );
    });
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run from `backend/`:

```bash
node --test tests/auth-routes.test.js
```

Expected: FAIL with `Cannot find module` for `../../src/routes/auth.js` by way
of `src/app.js`.

- [ ] **Step 5: Write the shared stub handler and the controllers**

Create `backend/src/controllers/not-implemented.js`:

```js
/**
 * The answer for every route that exists, is guarded, and has no service
 * behind it. One handler rather than fifty copies of one line; the detail
 * string is the one the Python service answers with today.
 */
import { NotImplemented } from "../middleware/errors.js";

export function notImplemented() {
  throw new NotImplemented(
    "Not implemented: the service layer for this route is not wired yet.",
  );
}
```

Create `backend/src/controllers/auth.js`:

```js
/**
 * Thin on purpose: validate, delegate, shape.
 *
 * Cookies are set by the Next.js Server Action that called this, because only
 * it has a browser to set them on. This service is never spoken to by one.
 */
import { z } from "zod";

import { transaction } from "../db/index.js";
import { NotImplemented, ValidationFailed } from "../middleware/errors.js";
import * as auth from "../services/auth.js";

// Field for field with app/schemas/auth.py, snake_case included, so the Zod
// schema in src/lib/api/ stays a transcription rather than a translation.
const signupSchema = z.object({
  full_name: z.string().min(2).max(200),
  email: z.email().max(320),
  // Length is the only rule that reliably predicts strength; matches the Zod
  // schema in auth-form.tsx so the two cannot disagree about what is valid.
  password: z.string().min(10).max(200),
});

const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(200),
});

const refreshSchema = z.object({ refresh_token: z.string().min(1) });

const switchWorkspaceSchema = z.object({ workspace_id: z.uuid() });

/**
 * One fixed detail rather than Pydantic's error list. src/lib/api/client.ts
 * reads a string `detail` and falls back to the status text, so the list was
 * never reaching a screen.
 */
function parse(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) throw new ValidationFailed();
  return result.data;
}

export function authController(sql, config) {
  return {
    async signup(request, response) {
      const body = parse(signupSchema, request.body);
      // The one use case here that is atomic: a half-created workspace with no
      // owner is worse than a failed signup.
      const result = await transaction(sql, (tx) => auth.signup(tx, config, body));
      response.status(201).json(result);
    },

    async login(request, response) {
      const body = parse(loginSchema, request.body);
      response.json(await auth.login(sql, config, body));
    },

    async refresh(request, response) {
      const { refresh_token: token } = parse(refreshSchema, request.body);
      response.json(await auth.refresh(sql, config, token));
    },

    async logout(request, response) {
      const { refresh_token: token } = parse(refreshSchema, request.body);
      await auth.logout(sql, token);
      response.status(204).end();
    },

    async switchWorkspace(request, response) {
      const { workspace_id: workspaceId } = parse(switchWorkspaceSchema, request.body);
      response.json(
        await auth.switchWorkspace(sql, config, request.principal, workspaceId),
      );
    },

    passwordReset() {
      throw new NotImplemented(
        "Not implemented: password reset needs the outbox from plan 4.",
      );
    },
  };
}
```

Create `backend/src/controllers/users.js`:

```js
import { notImplemented } from "./not-implemented.js";
import * as auth from "../services/auth.js";

export function usersController(sql) {
  return {
    async me(request, response) {
      response.json(await auth.describe(sql, request.principal));
    },

    updateMe: notImplemented,
  };
}
```

- [ ] **Step 6: Write the two routers**

Create `backend/src/routes/auth.js`:

```js
import { Router } from "express";

import { authController } from "../controllers/auth.js";
import { authenticate } from "../middleware/authenticate.js";

export function authRouter(sql, config) {
  const controller = authController(sql, config);
  const router = Router();

  // Signup, login and refresh are how a caller gets a token, so none of them
  // can require one. Logout takes the refresh token in its body, not the
  // access token in a header: a session whose access token has already expired
  // must still be endable.
  router.post("/signup", controller.signup);
  router.post("/login", controller.login);
  router.post("/refresh", controller.refresh);
  router.post("/logout", controller.logout);
  router.post(
    "/switch-workspace",
    authenticate(config.secretKey),
    controller.switchWorkspace,
  );
  // Guarded by nothing, as in app/api/routes/auth.py.
  router.post("/password-reset", controller.passwordReset);

  return router;
}
```

Create `backend/src/routes/users.js`:

```js
import { Router } from "express";

import { usersController } from "../controllers/users.js";
import { authenticate } from "../middleware/authenticate.js";

export function usersRouter(sql, config) {
  const controller = usersController(sql);
  const router = Router();

  router.use(authenticate(config.secretKey));
  router.get("/me", controller.me);
  router.patch("/me", controller.updateMe);

  return router;
}
```

- [ ] **Step 7: Mount them on the app**

Replace `backend/src/app.js` with:

```js
import express from "express";

import { errorHandler } from "./middleware/errors.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";

/**
 * No CORS middleware. The browser never calls this service: every request
 * arrives from the Next.js server with a bearer token. Adding CORS would mean
 * opening a public browser-facing surface that has no CSRF story.
 *
 * `sql` is passed in rather than reached for, so a test can hand the routers a
 * transaction it will roll back.
 */
export function createApp(config, sql) {
  const app = express();

  app.use(express.json());

  app.get("/health", (request, response) => {
    response.json({ status: "ok", environment: config.environment });
  });

  app.use("/api/auth", authRouter(sql, config));
  app.use("/api/users", usersRouter(sql, config));

  // Last. Express 5 routes a rejected handler promise here on its own, so no
  // controller needs its own try/catch.
  app.use(errorHandler);

  return app;
}
```

In `backend/src/server.js`, pass the client to `createApp`. The health check
must still answer while Neon is waking, and `getSql` opens no connection until
the first query, so building it before `listen()` costs nothing:

```js
// createApp(config) becomes:
createApp(config, getSql(config.databaseUrl))
```

Add `import { getSql } from "./db/index.js";` if `server.js` does not already
import it.

In `backend/tests/health.test.js`, the two `createApp(config)` calls become
`createApp(config, null)` — the health route touches no handle, and passing
`null` is what proves it.

- [ ] **Step 8: Run the whole suite**

Run from `backend/`:

```bash
npm test
```

Expected: PASS. `tests/auth-routes.test.js` contributes 13 tests, and every
P1 suite still passes.

- [ ] **Step 9: Commit**

```bash
git add backend/src backend/tests
git commit -m "feat: serve the six real auth and users endpoints"
```

---

### Task 8: The thirteen stub domains

**Files:**
- Create: `backend/src/routes/{ai,audit,automations,billing,collections,customers,integrations,invoices,notifications,payments,reports,workspaces}.js`
- Create: `backend/src/controllers/{ai,audit,automations,billing,collections,customers,integrations,invoices,notifications,payments,reports,workspaces}.js`
- Modify: `backend/src/app.js`
- Test: `backend/tests/stub-routes.test.js`

**Interfaces:**
- Consumes: `notImplemented` (Task 7), `authenticate` (Task 2), `requirePermission` (Task 2), `ROLE_PERMISSIONS` and `issueAccessToken` (Task 1).
- Produces: twelve `<domain>Router(sql, config)` factories, mounted under `/api/<domain>`, and their controllers. `usersRouter` from Task 7 gains nothing; its `PATCH /me` stub already exists.

Forty-nine endpoints, each one a path, a guard and a `501`. Spec decision 8
ships them all so the endpoint surface matches the Python service on the day it
is deleted, and spec decision 6 gives each domain its own router and controller
file even where the controller is a list of re-exports — the directory then
reads as a map of the product rather than a directory of blanks, and the file a
domain's first real handler belongs in already exists, with the right name.

No stub touches the database, which is why this suite builds the app with a
`null` handle: if a stub ever grows a query, the test fails loudly rather than
opening a connection nobody expected.

- [ ] **Step 1: Write the failing stub-route test**

Create `backend/tests/stub-routes.test.js`:

```js
/**
 * Every endpoint that exists and does nothing yet.
 *
 * Their only assertion is the one spec section 13 asks for: the status and the
 * detail string match the Python service they replace. The app is built with a
 * null database handle, so a stub that grew a query would fail here rather
 * than open a connection nobody expected.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { createApp } from "../src/app.js";
import { ROLE_PERMISSIONS, issueAccessToken, makePrincipal } from "../src/lib/security.js";
import { TEST_CONFIG } from "./helpers/app.js";

const DETAIL = "Not implemented: the service layer for this route is not wired yet.";

// method, path, and the permission the route is guarded by: null for a route
// that needs only a bearer token, "anonymous" for one guarded by nothing.
const STUBS = [
  ["POST", "/api/auth/password-reset", "anonymous"],
  ["PATCH", "/api/users/me", null],

  ["GET", "/api/workspaces", null],
  ["POST", "/api/workspaces", null],
  ["GET", "/api/workspaces/ws-1", null],
  ["PATCH", "/api/workspaces/ws-1", "workspace:write"],
  ["GET", "/api/workspaces/ws-1/members", "team:write"],
  ["POST", "/api/workspaces/ws-1/members", "team:write"],

  ["GET", "/api/customers", "customer:read"],
  ["POST", "/api/customers", "customer:write"],
  ["GET", "/api/customers/c-1", "customer:read"],
  ["PATCH", "/api/customers/c-1", "customer:write"],
  ["GET", "/api/customers/c-1/behaviour", "customer:read"],

  ["GET", "/api/invoices", "invoice:read"],
  ["POST", "/api/invoices", "invoice:write"],
  ["GET", "/api/invoices/i-1", "invoice:read"],
  ["PATCH", "/api/invoices/i-1", "invoice:write"],
  ["POST", "/api/invoices/i-1/send", "invoice:write"],
  ["GET", "/api/invoices/i-1/events", "invoice:read"],

  ["GET", "/api/payments", "payment:read"],
  ["POST", "/api/payments", "payment:write"],

  ["GET", "/api/collections/pipeline", "invoice:read"],
  ["GET", "/api/collections/queue", "invoice:read"],
  ["POST", "/api/collections/reminders", "invoice:write"],

  ["GET", "/api/automations", "automation:read"],
  ["POST", "/api/automations", "automation:write"],
  ["GET", "/api/automations/a-1", "automation:read"],
  ["PATCH", "/api/automations/a-1", "automation:write"],
  ["GET", "/api/automations/a-1/runs", "automation:read"],

  ["GET", "/api/notifications", null],
  ["POST", "/api/notifications/read", null],
  ["GET", "/api/notifications/preferences", null],
  ["PUT", "/api/notifications/preferences", null],

  ["GET", "/api/reports/aging", "report:read"],
  ["GET", "/api/reports/cash-flow", "report:read"],
  ["GET", "/api/reports/collection-rate", "report:read"],
  ["GET", "/api/reports/customer-risk", "report:read"],
  ["GET", "/api/reports/days-to-payment", "report:read"],

  ["GET", "/api/integrations", "integration:read"],
  ["POST", "/api/integrations/stripe/connect", "integration:write"],
  ["DELETE", "/api/integrations/stripe", "integration:write"],
  ["POST", "/api/integrations/stripe/sync", "integration:write"],

  ["POST", "/api/ai/analyze", "report:read"],
  ["POST", "/api/ai/draft-reminder", "invoice:read"],
  ["POST", "/api/ai/ask", "report:read"],

  ["GET", "/api/billing/subscription", null],
  ["POST", "/api/billing/subscription", "billing:write"],
  ["GET", "/api/billing/invoices", null],

  ["GET", "/api/audit", "audit:read"],
];

let server;
let origin;

before(async () => {
  server = createApp(TEST_CONFIG, null).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

async function tokenFor(role) {
  return issueAccessToken(
    makePrincipal(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      role,
    ),
    TEST_CONFIG.secretKey,
  );
}

function send(method, path, token) {
  return fetch(`${origin}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: ["POST", "PATCH", "PUT"].includes(method) ? "{}" : undefined,
  });
}

describe("the endpoint inventory", () => {
  it("is 49 stubs, which with 6 real endpoints is the 55 the spec counts", () => {
    assert.equal(STUBS.length, 49);
  });
});

describe("with no credentials", () => {
  for (const [method, path, permission] of STUBS) {
    const expected = permission === "anonymous" ? 501 : 401;
    it(`${method} ${path} answers ${expected}`, async () => {
      const response = await send(method, path, null);
      assert.equal(response.status, expected);
    });
  }
});

describe("as an owner", () => {
  for (const [method, path] of STUBS) {
    it(`${method} ${path} answers 501`, async () => {
      const response = await send(method, path, await tokenFor("owner"));
      assert.equal(response.status, 501);
      const body = await response.json();
      assert.equal(
        body.detail,
        path.endsWith("/password-reset")
          ? "Not implemented: password reset needs the outbox from plan 4."
          : DETAIL,
      );
    });
  }
});

describe("as a viewer", () => {
  for (const [method, path, permission] of STUBS) {
    const granted =
      permission === "anonymous" ||
      permission === null ||
      ROLE_PERMISSIONS.viewer.includes(permission);
    const expected = granted ? 501 : 403;

    it(`${method} ${path} answers ${expected}`, async () => {
      const response = await send(method, path, await tokenFor("viewer"));
      assert.equal(response.status, expected);
      if (!granted) {
        assert.equal((await response.json()).detail, `Requires ${permission}`);
      }
    });
  }
});

describe("the guards the routers actually mount", () => {
  it("name only permissions a role can hold", () => {
    // The reverse of the matrix test: a route guarded by a string that appears
    // in no grant list is a permanent 403 nobody can grant away.
    const directory = join(import.meta.dirname, "..", "src", "routes");
    const guarded = new Set();
    for (const file of readdirSync(directory)) {
      const source = readFileSync(join(directory, file), "utf8");
      for (const [, permission] of source.matchAll(
        /requirePermission\("([^"]+)"\)/g,
      )) {
        guarded.add(permission);
      }
    }

    const grantable = new Set(Object.values(ROLE_PERMISSIONS).flat());
    const ungrantable = [...guarded].filter(
      (permission) => !grantable.has(permission),
    );
    // billing:write is the known wart: no role enumerates it, so only owner
    // reaches it through the wildcard. It is grantable, and it is listed here
    // because the assertion below would otherwise hide a real typo.
    assert.deepEqual(ungrantable, ["billing:write"]);
  });

  it("guards every permission the routers claim to, and no more", () => {
    const directory = join(import.meta.dirname, "..", "src", "routes");
    const guarded = new Set();
    for (const file of readdirSync(directory)) {
      for (const [, permission] of readFileSync(
        join(directory, file),
        "utf8",
      ).matchAll(/requirePermission\("([^"]+)"\)/g)) {
        guarded.add(permission);
      }
    }
    const fromTable = new Set(
      STUBS.map(([, , permission]) => permission).filter(
        (permission) => permission && permission !== "anonymous",
      ),
    );
    assert.deepEqual([...guarded].sort(), [...fromTable].sort());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run from `backend/`:

```bash
node --test tests/stub-routes.test.js
```

Expected: FAIL — most routes answer 404, because only `/api/auth` and
`/api/users` are mounted.

- [ ] **Step 3: Write the twelve stub controllers**

Each is a list of named re-exports, so the handler a route refers to has a name
that says what it will do when it does something.

Create `backend/src/controllers/workspaces.js`:

```js
import { notImplemented } from "./not-implemented.js";

export const list = notImplemented;
export const create = notImplemented;
export const get = notImplemented;
export const update = notImplemented;
export const members = notImplemented;
export const invite = notImplemented;
```

Create `backend/src/controllers/customers.js`:

```js
import { notImplemented } from "./not-implemented.js";

export const list = notImplemented;
export const create = notImplemented;
export const get = notImplemented;
export const update = notImplemented;
export const behaviour = notImplemented;
```

Create `backend/src/controllers/invoices.js`:

```js
import { notImplemented } from "./not-implemented.js";

export const list = notImplemented;
export const create = notImplemented;
export const get = notImplemented;
export const update = notImplemented;
export const send = notImplemented;
export const events = notImplemented;
```

Create `backend/src/controllers/payments.js`:

```js
import { notImplemented } from "./not-implemented.js";

export const list = notImplemented;
export const create = notImplemented;
```

Create `backend/src/controllers/collections.js`:

```js
import { notImplemented } from "./not-implemented.js";

export const pipeline = notImplemented;
export const queue = notImplemented;
export const reminders = notImplemented;
```

Create `backend/src/controllers/automations.js`:

```js
import { notImplemented } from "./not-implemented.js";

export const list = notImplemented;
export const create = notImplemented;
export const get = notImplemented;
export const update = notImplemented;
export const runs = notImplemented;
```

Create `backend/src/controllers/notifications.js`:

```js
import { notImplemented } from "./not-implemented.js";

export const list = notImplemented;
export const markRead = notImplemented;
export const preferences = notImplemented;
export const replacePreferences = notImplemented;
```

Create `backend/src/controllers/reports.js`:

```js
import { notImplemented } from "./not-implemented.js";

export const aging = notImplemented;
export const cashFlow = notImplemented;
export const collectionRate = notImplemented;
export const customerRisk = notImplemented;
export const daysToPayment = notImplemented;
```

Create `backend/src/controllers/integrations.js`:

```js
import { notImplemented } from "./not-implemented.js";

export const list = notImplemented;
export const connect = notImplemented;
export const disconnect = notImplemented;
export const sync = notImplemented;
```

Create `backend/src/controllers/ai.js`:

```js
import { notImplemented } from "./not-implemented.js";

export const analyze = notImplemented;
export const draftReminder = notImplemented;
export const ask = notImplemented;
```

Create `backend/src/controllers/billing.js`:

```js
import { notImplemented } from "./not-implemented.js";

export const subscription = notImplemented;
export const changePlan = notImplemented;
export const invoices = notImplemented;
```

Create `backend/src/controllers/audit.js`:

```js
import { notImplemented } from "./not-implemented.js";

export const list = notImplemented;
```

- [ ] **Step 4: Write the twelve stub routers**

Every one of these mounts `authenticate` for the whole router first, then the
per-route permission guard. `router.get("/")` is the collection root: mounted
at `/api/customers` it answers `/api/customers`, and `/api/customers/` as well,
which FastAPI's `""` did not. A superset of the paths that worked before is not
a status change on any path that did.

Create `backend/src/routes/workspaces.js`:

```js
import { Router } from "express";

import * as controller from "../controllers/workspaces.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function workspacesRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.get("/", controller.list);
  router.post("/", controller.create);
  router.get("/:workspaceId", controller.get);
  router.patch("/:workspaceId", requirePermission("workspace:write"), controller.update);
  router.get("/:workspaceId/members", requirePermission("team:write"), controller.members);
  router.post("/:workspaceId/members", requirePermission("team:write"), controller.invite);

  return router;
}
```

Create `backend/src/routes/customers.js`:

```js
import { Router } from "express";

import * as controller from "../controllers/customers.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function customersRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.get("/", requirePermission("customer:read"), controller.list);
  router.post("/", requirePermission("customer:write"), controller.create);
  router.get("/:customerId", requirePermission("customer:read"), controller.get);
  router.patch("/:customerId", requirePermission("customer:write"), controller.update);
  router.get(
    "/:customerId/behaviour",
    requirePermission("customer:read"),
    controller.behaviour,
  );

  return router;
}
```

Create `backend/src/routes/invoices.js`:

```js
import { Router } from "express";

import * as controller from "../controllers/invoices.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function invoicesRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.get("/", requirePermission("invoice:read"), controller.list);
  router.post("/", requirePermission("invoice:write"), controller.create);
  router.get("/:invoiceId", requirePermission("invoice:read"), controller.get);
  router.patch("/:invoiceId", requirePermission("invoice:write"), controller.update);
  router.post("/:invoiceId/send", requirePermission("invoice:write"), controller.send);
  router.get("/:invoiceId/events", requirePermission("invoice:read"), controller.events);

  return router;
}
```

Create `backend/src/routes/payments.js`:

```js
import { Router } from "express";

import * as controller from "../controllers/payments.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function paymentsRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.get("/", requirePermission("payment:read"), controller.list);
  router.post("/", requirePermission("payment:write"), controller.create);

  return router;
}
```

Create `backend/src/routes/collections.js`:

```js
import { Router } from "express";

import * as controller from "../controllers/collections.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function collectionsRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.get("/pipeline", requirePermission("invoice:read"), controller.pipeline);
  router.get("/queue", requirePermission("invoice:read"), controller.queue);
  router.post("/reminders", requirePermission("invoice:write"), controller.reminders);

  return router;
}
```

Create `backend/src/routes/automations.js`:

```js
import { Router } from "express";

import * as controller from "../controllers/automations.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function automationsRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.get("/", requirePermission("automation:read"), controller.list);
  router.post("/", requirePermission("automation:write"), controller.create);
  router.get("/:automationId", requirePermission("automation:read"), controller.get);
  router.patch("/:automationId", requirePermission("automation:write"), controller.update);
  router.get("/:automationId/runs", requirePermission("automation:read"), controller.runs);

  return router;
}
```

Create `backend/src/routes/notifications.js`:

```js
import { Router } from "express";

import * as controller from "../controllers/notifications.js";
import { authenticate } from "../middleware/authenticate.js";

export function notificationsRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));

  // Guarded by a bearer token and nothing more: a notification is addressed to
  // the caller, so there is no role that should see someone else's.
  router.get("/", controller.list);
  router.post("/read", controller.markRead);
  router.get("/preferences", controller.preferences);
  router.put("/preferences", controller.replacePreferences);

  return router;
}
```

Create `backend/src/routes/reports.js`:

```js
import { Router } from "express";

import * as controller from "../controllers/reports.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function reportsRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));
  router.use(requirePermission("report:read"));

  router.get("/aging", controller.aging);
  router.get("/cash-flow", controller.cashFlow);
  router.get("/collection-rate", controller.collectionRate);
  router.get("/customer-risk", controller.customerRisk);
  router.get("/days-to-payment", controller.daysToPayment);

  return router;
}
```

Create `backend/src/routes/integrations.js`:

```js
import { Router } from "express";

import * as controller from "../controllers/integrations.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function integrationsRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.get("/", requirePermission("integration:read"), controller.list);
  router.post(
    "/:provider/connect",
    requirePermission("integration:write"),
    controller.connect,
  );
  router.delete("/:provider", requirePermission("integration:write"), controller.disconnect);
  router.post("/:provider/sync", requirePermission("integration:write"), controller.sync);

  return router;
}
```

Create `backend/src/routes/ai.js`:

```js
import { Router } from "express";

import * as controller from "../controllers/ai.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function aiRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.post("/analyze", requirePermission("report:read"), controller.analyze);
  router.post("/draft-reminder", requirePermission("invoice:read"), controller.draftReminder);
  router.post("/ask", requirePermission("report:read"), controller.ask);

  return router;
}
```

Create `backend/src/routes/billing.js`:

```js
import { Router } from "express";

import * as controller from "../controllers/billing.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function billingRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.get("/subscription", controller.subscription);
  // billing:write is granted by no role, so only owner reaches this, through
  // the wildcard. Ported as it is: a hosting change that quietly widens a
  // permission is a defect, and fixing it is a separate decision.
  router.post("/subscription", requirePermission("billing:write"), controller.changePlan);
  router.get("/invoices", controller.invoices);

  return router;
}
```

Create `backend/src/routes/audit.js`:

```js
import { Router } from "express";

import * as controller from "../controllers/audit.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function auditRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.get("/", requirePermission("audit:read"), controller.list);

  return router;
}
```

- [ ] **Step 5: Mount all fourteen**

In `backend/src/app.js`, extend the imports and replace the two `app.use`
mounts with all fourteen, in the order `app/main.py` registers them:

```js
import { aiRouter } from "./routes/ai.js";
import { auditRouter } from "./routes/audit.js";
import { authRouter } from "./routes/auth.js";
import { automationsRouter } from "./routes/automations.js";
import { billingRouter } from "./routes/billing.js";
import { collectionsRouter } from "./routes/collections.js";
import { customersRouter } from "./routes/customers.js";
import { integrationsRouter } from "./routes/integrations.js";
import { invoicesRouter } from "./routes/invoices.js";
import { notificationsRouter } from "./routes/notifications.js";
import { paymentsRouter } from "./routes/payments.js";
import { reportsRouter } from "./routes/reports.js";
import { usersRouter } from "./routes/users.js";
import { workspacesRouter } from "./routes/workspaces.js";
```

```js
  for (const [path, router] of [
    ["/api/auth", authRouter],
    ["/api/users", usersRouter],
    ["/api/workspaces", workspacesRouter],
    ["/api/customers", customersRouter],
    ["/api/invoices", invoicesRouter],
    ["/api/payments", paymentsRouter],
    ["/api/collections", collectionsRouter],
    ["/api/automations", automationsRouter],
    ["/api/notifications", notificationsRouter],
    ["/api/reports", reportsRouter],
    ["/api/integrations", integrationsRouter],
    ["/api/ai", aiRouter],
    ["/api/billing", billingRouter],
    ["/api/audit", auditRouter],
  ]) {
    app.use(path, router(sql, config));
  }
```

- [ ] **Step 6: Run the whole suite**

Run from `backend/`:

```bash
npm test
```

Expected: PASS. `tests/stub-routes.test.js` contributes 150 tests — 49 paths
across three credential states, plus the inventory count and the two guard
scans.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes backend/src/controllers backend/src/app.js backend/tests/stub-routes.test.js
git commit -m "feat: mount the thirteen stub domains behind their guards"
```

---

### Task 9: The tenancy suite

**Files:**
- Test: `backend/tests/tenancy.test.js`

**Interfaces:**
- Consumes: `withApp` (Task 7), the auth service, the models.
- Produces: nothing importable.

Spec §11 asks for a suite proving workspace A cannot reach workspace B. With
thirteen domains stubbed there is no cross-tenant read to attempt yet, so this
asserts the guarantee that actually carries the property today: **the workspace
is whatever the signed token says, and nothing a caller writes can change it.**
When P3 adds real domain models, this file is where their cross-tenant cases
join.

- [ ] **Step 1: Write the tenancy suite**

Create `backend/tests/tenancy.test.js`:

```js
/**
 * Workspace A cannot become workspace B.
 *
 * Every tenant-scoped decision in this service reads the workspace from the
 * signed token. These tests are the ones that fail if that ever becomes a
 * value a caller supplies.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { decodeAccessToken } from "../src/lib/security.js";
import { TEST_CONFIG, withApp } from "./helpers/app.js";

function signupBody(name) {
  return {
    full_name: name,
    email: `${randomUUID().slice(0, 8)}@example.test`,
    password: "correct-horse-1",
  };
}

async function signUp(send, name) {
  const response = await send("POST", "/api/auth/signup", { body: signupBody(name) });
  assert.equal(response.status, 201);
  return response.body;
}

describe("the workspace comes from the token", () => {
  it("reports the token's workspace, not one in the query string", async () => {
    await withApp(async ({ send }) => {
      const ada = await signUp(send, "Ada Lovelace");
      const grace = await signUp(send, "Grace Hopper");

      const response = await send(
        "GET",
        `/api/users/me?workspace_id=${grace.user.workspace_id}`,
        { token: ada.tokens.access_token },
      );

      assert.equal(response.status, 200);
      assert.equal(response.body.workspace_id, ada.user.workspace_id);
      assert.notEqual(response.body.workspace_id, grace.user.workspace_id);
    });
  });

  it("gives two tenants two different workspaces", async () => {
    await withApp(async ({ send }) => {
      const ada = await signUp(send, "Ada Lovelace");
      const grace = await signUp(send, "Grace Hopper");
      assert.notEqual(ada.user.workspace_id, grace.user.workspace_id);

      for (const [session, expected] of [
        [ada, ada.user],
        [grace, grace.user],
      ]) {
        const response = await send("GET", "/api/users/me", {
          token: session.tokens.access_token,
        });
        assert.equal(response.body.workspace_id, expected.workspace_id);
        assert.equal(response.body.email, expected.email);
      }
    });
  });
});

describe("switching workspace", () => {
  it("answers 404 for another tenant's workspace, not 403", async () => {
    // 403 would confirm the id exists, which turns a list of guessed ids into
    // a census of who else is on the platform.
    await withApp(async ({ send }) => {
      const ada = await signUp(send, "Ada Lovelace");
      const grace = await signUp(send, "Grace Hopper");

      const response = await send("POST", "/api/auth/switch-workspace", {
        token: ada.tokens.access_token,
        body: { workspace_id: grace.user.workspace_id },
      });

      assert.equal(response.status, 404);
      assert.equal(response.body.detail, "Workspace not found");
    });
  });

  it("answers 404 identically for a workspace that does not exist", async () => {
    await withApp(async ({ send }) => {
      const ada = await signUp(send, "Ada Lovelace");
      const real = await send("POST", "/api/auth/switch-workspace", {
        token: ada.tokens.access_token,
        body: { workspace_id: (await signUp(send, "Grace Hopper")).user.workspace_id },
      });
      const imaginary = await send("POST", "/api/auth/switch-workspace", {
        token: ada.tokens.access_token,
        body: { workspace_id: randomUUID() },
      });

      assert.equal(real.status, imaginary.status);
      assert.deepEqual(real.body, imaginary.body);
    });
  });

  it("issues a token for the new scope with the role it carries there", async () => {
    await withApp(async ({ send, tx }) => {
      const ada = await signUp(send, "Ada Lovelace");
      const principal = await decodeAccessToken(
        ada.tokens.access_token,
        TEST_CONFIG.secretKey,
      );

      const other = randomUUID();
      await tx`
        INSERT INTO workspaces (id, name, slug)
        VALUES (${other}, 'Client co', ${`client-${other.slice(0, 8)}`})
      `;
      await tx`
        INSERT INTO workspace_members (id, workspace_id, user_id, role, status)
        VALUES (${randomUUID()}, ${other}, ${principal.userId}, 'viewer', 'active')
      `;

      const response = await send("POST", "/api/auth/switch-workspace", {
        token: ada.tokens.access_token,
        body: { workspace_id: other },
      });
      assert.equal(response.status, 200);

      const after = await decodeAccessToken(
        response.body.tokens.access_token,
        TEST_CONFIG.secretKey,
      );
      assert.equal(after.workspaceId, other);
      // An owner in one workspace is a viewer in another. The role is the
      // membership's, never the user's.
      assert.equal(after.role, "viewer");
      assert.equal(response.body.user.role, "viewer");
    });
  });

  it("leaves the old token scoped where it was", async () => {
    // Switching mints a second session rather than moving the first one. A
    // token already in flight must not silently change tenant.
    await withApp(async ({ send, tx }) => {
      const ada = await signUp(send, "Ada Lovelace");
      const principal = await decodeAccessToken(
        ada.tokens.access_token,
        TEST_CONFIG.secretKey,
      );

      const other = randomUUID();
      await tx`
        INSERT INTO workspaces (id, name, slug)
        VALUES (${other}, 'Client co', ${`client-${other.slice(0, 8)}`})
      `;
      await tx`
        INSERT INTO workspace_members (id, workspace_id, user_id, role, status)
        VALUES (${randomUUID()}, ${other}, ${principal.userId}, 'viewer', 'active')
      `;
      await send("POST", "/api/auth/switch-workspace", {
        token: ada.tokens.access_token,
        body: { workspace_id: other },
      });

      const response = await send("GET", "/api/users/me", {
        token: ada.tokens.access_token,
      });
      assert.equal(response.body.workspace_id, ada.user.workspace_id);
    });
  });
});

describe("a session that lost its membership", () => {
  it("cannot refresh its way back in", async () => {
    // Removing someone from a workspace has to end their access at the next
    // rotation, not at the next thirty-minute token expiry plus a fortnight.
    await withApp(async ({ send, tx }) => {
      const ada = await signUp(send, "Ada Lovelace");
      await tx`
        UPDATE workspace_members SET status = 'invited'
        WHERE workspace_id = ${ada.user.workspace_id}
      `;

      const response = await send("POST", "/api/auth/refresh", {
        body: { refresh_token: ada.tokens.refresh_token },
      });
      assert.equal(response.status, 401);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it passes**

Run from `backend/`:

```bash
node --test tests/tenancy.test.js
```

Expected: PASS, 7 tests. This suite asserts behaviour Tasks 5 to 8 already
built, so it passes on the first run — it is a regression net, not a driver.

- [ ] **Step 3: Run the whole suite and start the service by hand**

Run from `backend/`:

```bash
npm test
npm start
```

Then, against the running process:

```bash
curl -s localhost:3001/health
curl -s -X POST localhost:3001/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"full_name":"Ada Lovelace","email":"ada@example.test","password":"correct-horse-1"}'
curl -s localhost:3001/api/invoices -o /dev/null -w '%{http_code}\n'
```

Expected: `{"status":"ok","environment":"local"}`; a 201 carrying `tokens` and
`user`; and `401` for the guarded stub with no token.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/tenancy.test.js
git commit -m "test: assert the workspace comes from the token and nowhere else"
```

---

## Done when

- `npm test` in `backend/` is green: every P1 suite plus `security`,
  `permissions`, `authenticate`, `models-auth`, `auth-service`, `auth-routes`,
  `stub-routes` and `tenancy`.
- All 55 endpoints answer the status the Python service answers with today,
  with the four recorded exceptions in "Corrections to the spec".
- `POST /api/auth/signup`, `login`, `refresh`, `logout`, `switch-workspace` and
  `GET /api/users/me` work against a real Postgres.
- No route reads a workspace id from a body, a query string or a path segment
  to decide what it may touch.
- `backend/app/` is untouched and still runs. It is deleted in P3.
- `npx tsc --noEmit` and `npm run build` still pass at the repository root —
  this phase changes no frontend file, so a failure there is a signal that
  something was edited that should not have been.

## Self-review against the spec

| Spec section | Where P2 covers it |
|---|---|
| §5 password hashing, argon2 defaults | Task 1 |
| §5 access token claims and TTL | Task 1, `issueAccessToken` |
| §5 refresh tokens opaque, SHA-256 | Task 1, and the reasoning is carried in the comment |
| §5 `ROLE_PERMISSIONS` verbatim, `billing:write` wart | Tasks 1, 3, 8 |
| §5 Principal as a plain object with `can()` | Task 1 |
| §5 the workspace comes from the token | Tasks 2, 9 |
| §5 no cookie reading, bearer only | Task 2 |
| §6 Zod replaces Pydantic | Task 7 |
| §6 transactions for multi-statement writes | Task 7, `signup` only; reasoning in "Transactions: who opens them" |
| §11 security, permissions, auth-service, tenancy suites | Tasks 1, 3, 5, 6, 9 |
| §13 all 55 endpoints, auth real and 13 domains stubbed | Tasks 7, 8 |
| §5 shared scoping helper | **Deferred to P3** — see "Corrections to the spec", item 4 |

Not in this plan and not in this phase: the seeder and reseed endpoint, the
Python deletion, the `vercel.json` reduction, the CI switch (already done in P1)
and deployment. All P3.
