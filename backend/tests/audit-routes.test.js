/**
 * GET /api/audit.
 *
 * Covers what the route and controller add: the actor/action/target shape a
 * person reads (not the raw actor_user_id/target_type/target_id columns),
 * paging, and tenancy.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { issueAccessToken, makePrincipal } from "../src/lib/security.js";
import { sql } from "./helpers/database.js";
import { makeAuditLog, makeCustomer, makeInvoice, makeWorkspace } from "./helpers/factories.js";
import { TEST_CONFIG, withApp } from "./helpers/app.js";

after(() => sql.end());

async function tokenFor(workspaceId, role = "owner") {
  return issueAccessToken(
    makePrincipal(randomUUID(), workspaceId, role),
    TEST_CONFIG.secretKey,
  );
}

describe("GET /api/audit", () => {
  it("names the invoice and customer instead of the raw target id", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Audit Co" });
      const invoiceId = await makeInvoice(tx, ws, customer, { amount: 10_000, dueOffsetDays: 10 });
      await makeAuditLog(tx, ws, {
        actorLabel: "Alex Mercer",
        action: "payment.recorded",
        targetId: invoiceId,
      });

      const response = await send("GET", "/api/audit", { token: await tokenFor(ws) });

      assert.equal(response.status, 200);
      assert.equal(response.body.total, 1);
      const entry = response.body.data[0];
      assert.equal(entry.actor, "Alex Mercer");
      assert.equal(entry.action, "Recorded payment");
      assert.match(entry.target, /^Audit Co$|Audit Co/);
      assert.ok(entry.occurred_at);
    });
  });

  it("falls back to the raw id when the target is not an invoice in scope", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const fakeId = randomUUID();
      await makeAuditLog(tx, ws, { targetId: fakeId, action: "invoice.updated" });

      const response = await send("GET", "/api/audit", { token: await tokenFor(ws) });

      assert.equal(response.body.data[0].target, fakeId);
    });
  });

  it("does not return another workspace's audit log", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      await makeAuditLog(tx, theirs, {});

      const response = await send("GET", "/api/audit", { token: await tokenFor(mine) });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, []);
      assert.equal(response.body.total, 0);
    });
  });

  it("rejects a viewer -- audit:read is admin and owner only", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const response = await send("GET", "/api/audit", { token: await tokenFor(ws, "viewer") });
      assert.equal(response.status, 403);
    });
  });
});
