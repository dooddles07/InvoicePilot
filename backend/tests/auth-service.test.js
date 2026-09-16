import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { Conflict } from "../src/middleware/errors.js";
import { decodeAccessToken, hashRefreshToken } from "../src/lib/security.js";
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
