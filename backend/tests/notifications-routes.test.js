/**
 * GET /api/notifications/templates.
 *
 * Every workspace gets all three tones at signup (insertEmailTemplates);
 * this file covers the route reading them back, and tenancy.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { issueAccessToken, makePrincipal } from "../src/lib/security.js";
import { insertEmailTemplates } from "../src/models/notifications.js";
import { sql } from "./helpers/database.js";
import { makeWorkspace } from "./helpers/factories.js";
import { TEST_CONFIG, withApp } from "./helpers/app.js";

after(() => sql.end());

async function tokenFor(workspaceId, role = "owner") {
  return issueAccessToken(
    makePrincipal(randomUUID(), workspaceId, role),
    TEST_CONFIG.secretKey,
  );
}

describe("GET /api/notifications/templates", () => {
  it("returns the three seeded tones", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      await insertEmailTemplates(tx, ws);

      const response = await send("GET", "/api/notifications/templates", {
        token: await tokenFor(ws),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 3);
      assert.deepEqual(
        response.body.data.map((t) => t.tone).sort(),
        ["final", "firm", "friendly"],
      );
      assert.ok(response.body.data[0].subject.length > 0);
      assert.equal(response.body.data[0].used_by, undefined);
    });
  });

  it("does not return another workspace's templates", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      await insertEmailTemplates(tx, theirs);

      const response = await send("GET", "/api/notifications/templates", {
        token: await tokenFor(mine),
      });

      assert.deepEqual(response.body.data, []);
    });
  });
});
