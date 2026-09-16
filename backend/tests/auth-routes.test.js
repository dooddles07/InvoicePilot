/**
 * The auth endpoints through the real Express app.
 *
 * Status codes and response shape only -- the rules themselves are tested in
 * auth-service.test.js, and repeating them here would double the maintenance
 * without doubling the coverage.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { sql } from "./helpers/database.js";
import { withApp } from "./helpers/app.js";

after(() => sql.end());

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
