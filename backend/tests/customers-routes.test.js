/**
 * GET /api/customers, GET /api/customers/:id, GET /api/customers/:id/behaviour,
 * GET /api/customers/:id/events.
 *
 * customer_stats has its own suite for the risk-grading rules; this file only
 * covers what the route and controller add on top -- filtering, paging, and
 * tenancy.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { issueAccessToken, makePrincipal } from "../src/lib/security.js";
import { sql } from "./helpers/database.js";
import {
  makeCollectionEvent,
  makeCustomer,
  makeInvoice,
  makeWorkspace,
} from "./helpers/factories.js";
import { TEST_CONFIG, withApp } from "./helpers/app.js";

after(() => sql.end());

async function tokenFor(workspaceId, role = "owner") {
  return issueAccessToken(
    makePrincipal(randomUUID(), workspaceId, role),
    TEST_CONFIG.secretKey,
  );
}

describe("GET /api/customers", () => {
  it("lists only this workspace's customers, with stats attached", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      await makeCustomer(tx, ws, { name: "Acme Co", terms: 45 });

      const response = await send("GET", "/api/customers", { token: await tokenFor(ws) });

      assert.equal(response.status, 200);
      assert.equal(response.body.total, 1);
      const customer = response.body.data[0];
      assert.equal(customer.name, "Acme Co");
      assert.equal(customer.payment_terms_days, 45);
      assert.equal(customer.risk, "low");
      assert.equal(customer.open_invoice_count, 0);
    });
  });

  it("does not return another workspace's customers", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      await makeCustomer(tx, theirs, { name: "Other Co" });

      const response = await send("GET", "/api/customers", { token: await tokenFor(mine) });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, []);
      assert.equal(response.body.total, 0);
    });
  });

  it("filters by risk", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      await makeCustomer(tx, ws, { name: "Safe Co" });
      const risky = await makeCustomer(tx, ws, { name: "Risky Co" });
      // 70 days past due with no payment -- oldest_open_days > 60 grades high.
      await makeInvoice(tx, ws, risky, { amount: 50_000, dueOffsetDays: -70 });

      const response = await send("GET", "/api/customers?risk=high", {
        token: await tokenFor(ws),
      });

      assert.equal(response.body.total, 1);
      assert.equal(response.body.data[0].name, "Risky Co");
    });
  });

  it("searches by name, contact name and industry", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      await makeCustomer(tx, ws, { name: "Acme Rockets" });
      await makeCustomer(tx, ws, { name: "Globex" });

      const response = await send("GET", "/api/customers?search=rockets", {
        token: await tokenFor(ws),
      });

      assert.equal(response.body.total, 1);
      assert.equal(response.body.data[0].name, "Acme Rockets");
    });
  });
});

describe("GET /api/customers/:customerId", () => {
  it("answers 404 for another workspace's customer, not 403", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const theirCustomer = await makeCustomer(tx, theirs, { name: "Other Co" });

      const response = await send("GET", `/api/customers/${theirCustomer}`, {
        token: await tokenFor(mine),
      });

      assert.equal(response.status, 404);
      assert.equal(response.body.detail, "Customer not found");
    });
  });

  it("answers 404 identically for a customer that does not exist", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const response = await send("GET", `/api/customers/${randomUUID()}`, {
        token: await tokenFor(ws),
      });
      assert.equal(response.status, 404);
      assert.equal(response.body.detail, "Customer not found");
    });
  });
});

describe("GET /api/customers/:customerId/behaviour", () => {
  it("averages days beyond terms by month for settled invoices", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Behaviour Co", terms: 30 });
      // Paid 5 days after the due date.
      await makeInvoice(tx, ws, customer, {
        amount: 10_000,
        status: "paid",
        paid: 10_000,
        dueOffsetDays: -35,
        paidOffsetDays: -30,
      });

      const response = await send("GET", `/api/customers/${customer}/behaviour`, {
        token: await tokenFor(ws),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 1);
      assert.equal(response.body.data[0].days_beyond_terms, 5);
    });
  });

  it("answers 404 for another workspace's customer", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const theirCustomer = await makeCustomer(tx, theirs, { name: "Other Co" });

      const response = await send("GET", `/api/customers/${theirCustomer}/behaviour`, {
        token: await tokenFor(mine),
      });

      assert.equal(response.status, 404);
    });
  });
});

describe("GET /api/customers/:customerId/events", () => {
  it("returns this customer's events, newest first", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Events Co" });
      await makeCollectionEvent(tx, ws, customer, {
        type: "note_added",
        occurredOffsetDays: -5,
      });
      await makeCollectionEvent(tx, ws, customer, {
        type: "call_logged",
        occurredOffsetDays: -1,
      });

      const response = await send("GET", `/api/customers/${customer}/events`, {
        token: await tokenFor(ws),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 2);
      assert.equal(response.body.data[0].type, "call_logged");
      assert.equal(response.body.data[1].type, "note_added");
    });
  });

  it("answers 404 for another workspace's customer before touching events", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const theirCustomer = await makeCustomer(tx, theirs, { name: "Other Co" });

      const response = await send("GET", `/api/customers/${theirCustomer}/events`, {
        token: await tokenFor(mine),
      });

      assert.equal(response.status, 404);
    });
  });
});
