/**
 * GET/POST /api/automations, GET/PATCH /api/automations/:id,
 * GET /api/automations/:id/runs.
 *
 * The daily evaluator itself has its own suite, automations-evaluator.test.js
 * -- this file covers the CRUD surface and tenancy.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { issueAccessToken, makePrincipal } from "../src/lib/security.js";
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

const NEW_AUTOMATION = {
  name: "Friendly Payment Reminder",
  description: "Nudges every invoice a week overdue.",
  trigger_label: "Invoice becomes overdue",
  trigger_days: 7,
  tone: "friendly",
};

describe("POST /api/automations", () => {
  it("creates a disabled automation with zeroed stats", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const response = await send("POST", "/api/automations", {
        token: await tokenFor(ws),
        body: NEW_AUTOMATION,
      });

      assert.equal(response.status, 201);
      assert.equal(response.body.name, "Friendly Payment Reminder");
      assert.equal(response.body.enabled, false);
      assert.equal(response.body.runs_30d, 0);
      assert.equal(response.body.recovered_cents_30d, 0);
      assert.equal(response.body.nodes.length, 1);
      assert.equal(response.body.nodes[0].type, "trigger");
    });
  });
});

describe("GET /api/automations", () => {
  it("does not return another workspace's automations", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      await send("POST", "/api/automations", { token: await tokenFor(theirs), body: NEW_AUTOMATION });

      const response = await send("GET", "/api/automations", { token: await tokenFor(mine) });
      assert.deepEqual(response.body.data, []);
    });
  });
});

describe("PATCH /api/automations/:automationId", () => {
  it("enables the automation and edits its node graph", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const token = await tokenFor(ws);
      const created = await send("POST", "/api/automations", { token, body: NEW_AUTOMATION });

      const response = await send("PATCH", `/api/automations/${created.body.id}`, {
        token,
        body: {
          enabled: true,
          nodes: [
            { id: "nd_1", type: "trigger", title: "Invoice becomes overdue", detail: "7 days overdue" },
            { id: "nd_2", type: "email", title: "Send email", detail: "Template: Friendly nudge" },
          ],
        },
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.enabled, true);
      assert.equal(response.body.nodes.length, 2);
    });
  });

  it("answers 404 for an automation in another workspace", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const created = await send("POST", "/api/automations", {
        token: await tokenFor(theirs),
        body: NEW_AUTOMATION,
      });

      const response = await send("PATCH", `/api/automations/${created.body.id}`, {
        token: await tokenFor(mine),
        body: { enabled: true },
      });
      assert.equal(response.status, 404);
    });
  });
});

describe("GET /api/automations/:automationId/runs", () => {
  it("is empty before the automation has ever run", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const token = await tokenFor(ws);
      const created = await send("POST", "/api/automations", { token, body: NEW_AUTOMATION });

      const response = await send("GET", `/api/automations/${created.body.id}/runs`, { token });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, []);
    });
  });
});
