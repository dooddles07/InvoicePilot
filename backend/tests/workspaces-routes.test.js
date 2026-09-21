/**
 * GET /api/workspaces/:workspaceId/members.
 *
 * Covers what the route and controller add: the nested user object, leaving
 * out a pending invite with no user row, and the one tenancy rule unique to
 * this route -- the workspace comes from the token, not from the URL.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { issueAccessToken, makePrincipal } from "../src/lib/security.js";
import { sql } from "./helpers/database.js";
import { makeMember, makeUser, makeWorkspace } from "./helpers/factories.js";
import { TEST_CONFIG, withApp } from "./helpers/app.js";

after(() => sql.end());

async function tokenFor(workspaceId, role = "owner") {
  return issueAccessToken(
    makePrincipal(randomUUID(), workspaceId, role),
    TEST_CONFIG.secretKey,
  );
}

describe("GET /api/workspaces/:workspaceId/members", () => {
  it("lists members with the user nested", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const user = await makeUser(tx, { fullName: "Priya Raman" });
      await makeMember(tx, ws, user, { role: "admin" });
      const token = await issueAccessToken(makePrincipal(user, ws, "admin"), TEST_CONFIG.secretKey);

      const response = await send("GET", `/api/workspaces/${ws}/members`, { token });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 1);
      const member = response.body.data[0];
      assert.equal(member.user.full_name, "Priya Raman");
      assert.equal(member.role, "admin");
    });
  });

  it("leaves out a pending invite with no user yet", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const user = await makeUser(tx);
      await makeMember(tx, ws, user);
      await tx`
        INSERT INTO workspace_members (id, workspace_id, invited_email, role, status)
        VALUES (gen_random_uuid(), ${ws}, 'pending@example.test', 'viewer', 'invited')
      `;

      const response = await send("GET", `/api/workspaces/${ws}/members`, {
        token: await tokenFor(ws),
      });

      assert.equal(response.body.data.length, 1);
    });
  });

  it("answers 404 when the URL names a workspace the token is not scoped to", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);

      const response = await send("GET", `/api/workspaces/${theirs}/members`, {
        token: await tokenFor(mine),
      });

      assert.equal(response.status, 404);
    });
  });
});
