import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { Conflict } from "../src/middleware/errors.js";
import { decodeAccessToken } from "../src/lib/security.js";
import { login, signup } from "../src/services/auth.js";
import { sql, withRollback } from "./helpers/database.js";

after(() => sql.end());

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
