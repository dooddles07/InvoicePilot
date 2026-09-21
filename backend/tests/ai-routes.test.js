/**
 * POST /api/ai/ask.
 *
 * services/ai.js is a keyword router over real aggregates -- this file
 * checks each branch actually fires and that an empty workspace answers
 * cleanly instead of crashing on an empty rankedByCustomer/contributors list.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { issueAccessToken, makePrincipal } from "../src/lib/security.js";
import { sql } from "./helpers/database.js";
import { makeCustomer, makeInvoice, makePayment, makeWorkspace } from "./helpers/factories.js";
import { TEST_CONFIG, withApp } from "./helpers/app.js";

after(() => sql.end());

async function tokenFor(workspaceId, role = "owner") {
  return issueAccessToken(
    makePrincipal(randomUUID(), workspaceId, role),
    TEST_CONFIG.secretKey,
  );
}

describe("POST /api/ai/ask", () => {
  it("answers a collections question from real payments", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Collected Co" });
      const invoiceId = await makeInvoice(tx, ws, customer, {
        amount: 50_000,
        paid: 50_000,
        status: "paid",
        dueOffsetDays: -5,
      });
      await makePayment(tx, ws, invoiceId, customer, { amountCents: 50_000, receivedOffsetDays: -2 });

      const response = await send("POST", "/api/ai/ask", {
        token: await tokenFor(ws),
        body: { question: "How much did we collect this month?" },
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.id, "ans_collected");
      assert.match(response.body.headline, /collected/i);
      assert.equal(response.body.requires_confirmation, true);
    });
  });

  it("answers a priority question ranked by the recovery queue", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Overdue Co" });
      await makeInvoice(tx, ws, customer, { amount: 40_000, dueOffsetDays: -40 });

      const response = await send("POST", "/api/ai/ask", {
        token: await tokenFor(ws),
        body: { question: "Which invoices should I prioritise?" },
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.id, "ans_priority");
      assert.ok(response.body.contributors.length > 0);
      assert.match(response.body.contributors[0].href, /^\/invoices\//);
    });
  });

  it("falls back to the overdue-balance answer for an unmatched question", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const response = await send("POST", "/api/ai/ask", {
        token: await tokenFor(ws),
        body: { question: "What is the meaning of life?" },
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.id, "ans_overdue");
    });
  });

  it("answers cleanly for a workspace with no invoices at all", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const response = await send("POST", "/api/ai/ask", {
        token: await tokenFor(ws),
        body: { question: "Which invoices should I prioritise?" },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.contributors, []);
      assert.match(response.body.recommended_action, /the top account/);
    });
  });

  it("rejects an empty question", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const response = await send("POST", "/api/ai/ask", {
        token: await tokenFor(ws),
        body: { question: "" },
      });
      assert.equal(response.status, 422);
    });
  });

  it("does not blend another workspace's ledger into the answer", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const theirCustomer = await makeCustomer(tx, theirs, { name: "Other Co" });
      await makeInvoice(tx, theirs, theirCustomer, { amount: 500_000, dueOffsetDays: -90 });

      const response = await send("POST", "/api/ai/ask", {
        token: await tokenFor(mine),
        body: { question: "Which invoices should I prioritise?" },
      });

      assert.deepEqual(response.body.contributors, []);
    });
  });
});
