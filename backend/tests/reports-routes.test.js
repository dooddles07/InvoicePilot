/**
 * GET /api/reports/summary, /aging, /cash-flow.
 *
 * reports-invariants.test.js covers the aggregation math directly against
 * the model functions; this file covers the route and controller layer --
 * shape, the range query param, and tenancy.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { issueAccessToken, makePrincipal } from "../src/lib/security.js";
import { sql } from "./helpers/database.js";
import { makeCustomer, makeInvoice, makeWorkspace } from "./helpers/factories.js";
import { TEST_CONFIG, withApp } from "./helpers/app.js";

after(() => sql.end());

async function tokenFor(workspaceId, role = "owner") {
  return issueAccessToken(
    makePrincipal(randomUUID(), workspaceId, role),
    TEST_CONFIG.secretKey,
  );
}

describe("GET /api/reports/summary", () => {
  it("returns the four KPI figures with change and a 12-point trend each", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Summary Co" });
      await makeInvoice(tx, ws, customer, { amount: 10_000, dueOffsetDays: -10 });

      const response = await send("GET", "/api/reports/summary", {
        token: await tokenFor(ws),
      });

      assert.equal(response.status, 200);
      const body = response.body;
      for (const key of [
        "outstanding_cents",
        "overdue_cents",
        "collected_30d_cents",
        "collection_rate",
      ]) {
        assert.equal(typeof body[key], "number", `${key} should be a number`);
      }
      assert.equal(body.outstanding_trend.length, 12);
      assert.equal(body.overdue_trend.length, 12);
      assert.equal(body.collected_trend.length, 12);
      assert.equal(body.collection_rate_trend.length, 12);
    });
  });

  it("does not count another workspace's invoices", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const theirCustomer = await makeCustomer(tx, theirs, { name: "Other Co" });
      await makeInvoice(tx, theirs, theirCustomer, { amount: 100_000, dueOffsetDays: -10 });

      const response = await send("GET", "/api/reports/summary", {
        token: await tokenFor(mine),
      });

      assert.equal(response.body.outstanding_cents, 0);
    });
  });
});

describe("GET /api/reports/aging", () => {
  it("returns all five buckets and a per-customer breakdown", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Aging Co" });
      await makeInvoice(tx, ws, customer, { amount: 10_000, dueOffsetDays: -45 });

      const response = await send("GET", "/api/reports/aging", { token: await tokenFor(ws) });

      assert.equal(response.status, 200);
      assert.equal(response.body.buckets.length, 5);
      assert.equal(response.body.by_customer.length, 1);
      assert.equal(response.body.by_customer[0].customer_name, "Aging Co");
    });
  });
});

describe("GET /api/reports/cash-flow", () => {
  it("defaults to the 30d range", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const response = await send("GET", "/api/reports/cash-flow", {
        token: await tokenFor(ws),
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 15);
    });
  });

  it("switches bucket count with the range parameter", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const response = await send("GET", "/api/reports/cash-flow?range=12m", {
        token: await tokenFor(ws),
      });
      assert.equal(response.body.data.length, 12);
    });
  });

  it("rejects an unknown range", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const response = await send("GET", "/api/reports/cash-flow?range=5y", {
        token: await tokenFor(ws),
      });
      assert.equal(response.status, 422);
    });
  });
});
