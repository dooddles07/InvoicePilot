/**
 * GET /api/collections/pipeline, GET /api/collections/queue.
 *
 * collection_queue has its own suite for the ranking rules (one row per
 * customer, overdue-only, recovery decay); this file covers what the route
 * and controller add on top -- stage bucketing, the ai_note join, and
 * tenancy.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { issueAccessToken, makePrincipal } from "../src/lib/security.js";
import { insertEmailTemplates } from "../src/models/notifications.js";
import { sql } from "./helpers/database.js";
import { makeCustomer, makeInvoice, makeUser, makeWorkspace } from "./helpers/factories.js";
import { TEST_CONFIG, withApp } from "./helpers/app.js";

after(() => sql.end());

async function tokenFor(workspaceId, role = "owner") {
  return issueAccessToken(
    makePrincipal(randomUUID(), workspaceId, role),
    TEST_CONFIG.secretKey,
  );
}

async function tokenForUser(userId, workspaceId, role = "owner") {
  return issueAccessToken(makePrincipal(userId, workspaceId, role), TEST_CONFIG.secretKey);
}

describe("GET /api/collections/pipeline", () => {
  it("buckets open invoices into stages by days_overdue", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Pipeline Co" });
      await makeInvoice(tx, ws, customer, { amount: 10_000, dueOffsetDays: 10 }); // upcoming
      await makeInvoice(tx, ws, customer, { amount: 20_000, dueOffsetDays: 0 }); // due_today
      await makeInvoice(tx, ws, customer, { amount: 30_000, dueOffsetDays: -15 }); // late_1_30
      await makeInvoice(tx, ws, customer, { amount: 40_000, dueOffsetDays: -45 }); // late_31_60
      await makeInvoice(tx, ws, customer, { amount: 50_000, dueOffsetDays: -90 }); // late_60_plus
      // Draft and paid are excluded from the pipeline entirely.
      await makeInvoice(tx, ws, customer, {
        amount: 60_000,
        status: "draft",
        dueOffsetDays: -90,
      });
      await makeInvoice(tx, ws, customer, {
        amount: 70_000,
        paid: 70_000,
        status: "paid",
        dueOffsetDays: -90,
      });

      const response = await send("GET", "/api/collections/pipeline", {
        token: await tokenFor(ws),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 5);
      const stages = response.body.data.map((i) => i.stage).sort();
      assert.deepEqual(stages, [
        "due_today",
        "late_1_30",
        "late_31_60",
        "late_60_plus",
        "upcoming",
      ]);
    });
  });

  it("does not return another workspace's invoices", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const theirCustomer = await makeCustomer(tx, theirs, { name: "Other Co" });
      await makeInvoice(tx, theirs, theirCustomer, { amount: 10_000, dueOffsetDays: -10 });

      const response = await send("GET", "/api/collections/pipeline", {
        token: await tokenFor(mine),
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, []);
    });
  });
});

describe("GET /api/collections/queue", () => {
  it("ranks by recovery score and attaches an ai_note", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Queue Co" });
      await makeInvoice(tx, ws, customer, { amount: 50_000, dueOffsetDays: -70 });

      const response = await send("GET", "/api/collections/queue", {
        token: await tokenFor(ws),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 1);
      const item = response.body.data[0];
      assert.equal(item.customer_name, "Queue Co");
      assert.equal(typeof item.ai_note, "string");
      assert.ok(item.ai_note.length > 0);
    });
  });

  it("respects the limit parameter", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      for (let i = 0; i < 3; i++) {
        const customer = await makeCustomer(tx, ws, { name: `Customer ${i}` });
        await makeInvoice(tx, ws, customer, { amount: 10_000, dueOffsetDays: -20 });
      }

      const response = await send("GET", "/api/collections/queue?limit=2", {
        token: await tokenFor(ws),
      });

      assert.equal(response.body.data.length, 2);
    });
  });

  it("does not return another workspace's queue", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const theirCustomer = await makeCustomer(tx, theirs, { name: "Other Co" });
      await makeInvoice(tx, theirs, theirCustomer, { amount: 10_000, dueOffsetDays: -70 });

      const response = await send("GET", "/api/collections/queue", {
        token: await tokenFor(mine),
      });

      assert.deepEqual(response.body.data, []);
    });
  });
});

describe("GET /api/collections/insights", () => {
  it("ranks by priority and names this invoice's share of the overdue book", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Insights Co" });
      await makeInvoice(tx, ws, customer, { amount: 50_000, dueOffsetDays: -40 });

      const response = await send("GET", "/api/collections/insights", {
        token: await tokenFor(ws),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 1);
      const insight = response.body.data[0];
      assert.equal(insight.priority, 1);
      assert.equal(insight.customer_name, "Insights Co");
      assert.match(insight.reasoning, /% of your overdue balance/);
      assert.ok(insight.confidence > 0 && insight.confidence <= 0.95);
    });
  });
});

describe("GET /api/collections/summary", () => {
  it("returns the three ai-summary headline numbers", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Summary Co" });
      await makeInvoice(tx, ws, customer, { amount: 10_000, dueOffsetDays: -10 });

      const response = await send("GET", "/api/collections/summary", {
        token: await tokenFor(ws),
      });

      assert.equal(response.status, 200);
      assert.equal(typeof response.body.recoverable_cents, "number");
      assert.equal(typeof response.body.at_risk_count, "number");
      assert.equal(typeof response.body.contact_count, "number");
    });
  });

  it("does not count another workspace's ledger", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const theirCustomer = await makeCustomer(tx, theirs, { name: "Other Co" });
      await makeInvoice(tx, theirs, theirCustomer, { amount: 100_000, dueOffsetDays: -10 });

      const response = await send("GET", "/api/collections/summary", {
        token: await tokenFor(mine),
      });

      assert.equal(response.body.recoverable_cents, 0);
      assert.equal(response.body.contact_count, 0);
    });
  });
});

describe("POST /api/collections/reminders", () => {
  it("sends a reminder on an already-sent invoice without changing its status", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      await insertEmailTemplates(tx, ws);
      const user = await makeUser(tx);
      const customer = await makeCustomer(tx, ws, { name: "Reminder Co" });
      const invoiceId = await makeInvoice(tx, ws, customer, {
        amount: 20_000,
        status: "sent",
        dueOffsetDays: -15,
      });

      const response = await send("POST", "/api/collections/reminders", {
        token: await tokenForUser(user, ws),
        body: { invoice_id: invoiceId, tone: "firm", idempotency_key: "coll-reminder-1" },
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.status, "sent");
    });
  });

  it("answers 404 for another workspace's invoice", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const user = await makeUser(tx);
      const theirCustomer = await makeCustomer(tx, theirs, { name: "Other Co" });
      const theirInvoice = await makeInvoice(tx, theirs, theirCustomer, {
        amount: 10_000,
        status: "sent",
        dueOffsetDays: -10,
      });

      const response = await send("POST", "/api/collections/reminders", {
        token: await tokenForUser(user, mine),
        body: { invoice_id: theirInvoice, idempotency_key: "cross-tenant-reminder" },
      });

      assert.equal(response.status, 404);
    });
  });
});
