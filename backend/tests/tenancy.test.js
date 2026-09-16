/**
 * Workspace A cannot become workspace B.
 *
 * Every tenant-scoped decision in this service reads the workspace from the
 * signed token. These tests are the ones that fail if that ever becomes a
 * value a caller supplies.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { decodeAccessToken } from "../src/lib/security.js";
import { sql } from "./helpers/database.js";
import { TEST_CONFIG, withApp } from "./helpers/app.js";

after(() => sql.end());

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
