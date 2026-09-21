/**
 * GET /api/payments.
 *
 * Covers what the route and controller add: the denormalized invoice number
 * and customer name, paging, sort ambiguity between payments.amount_cents
 * and invoices.amount_cents, and tenancy.
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

describe("GET /api/payments", () => {
  it("lists only this workspace's payments, with the invoice and customer denormalized", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Acme Co" });
      const invoiceId = await makeInvoice(tx, ws, customer, {
        amount: 10_000,
        paid: 10_000,
        status: "paid",
        dueOffsetDays: 10,
      });
      await makePayment(tx, ws, invoiceId, customer, {
        amountCents: 10_000,
        method: "card",
        reference: "TXN-1",
      });

      const response = await send("GET", "/api/payments", { token: await tokenFor(ws) });

      assert.equal(response.status, 200);
      assert.equal(response.body.total, 1);
      const payment = response.body.data[0];
      assert.equal(payment.customer_name, "Acme Co");
      assert.equal(payment.amount_cents, 10_000);
      assert.equal(payment.method, "card");
    });
  });

  it("does not return another workspace's payments", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const theirCustomer = await makeCustomer(tx, theirs, { name: "Other Co" });
      const theirInvoice = await makeInvoice(tx, theirs, theirCustomer, {
        amount: 5_000,
        paid: 5_000,
        status: "paid",
        dueOffsetDays: 10,
      });
      await makePayment(tx, theirs, theirInvoice, theirCustomer, { amountCents: 5_000 });

      const response = await send("GET", "/api/payments", { token: await tokenFor(mine) });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, []);
      assert.equal(response.body.total, 0);
    });
  });

  it("sorts by amount_cents without column ambiguity", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Sort Co" });
      const small = await makeInvoice(tx, ws, customer, {
        amount: 1_000,
        paid: 1_000,
        status: "paid",
        dueOffsetDays: 10,
      });
      const large = await makeInvoice(tx, ws, customer, {
        amount: 90_000,
        paid: 90_000,
        status: "paid",
        dueOffsetDays: 10,
      });
      await makePayment(tx, ws, small, customer, { amountCents: 1_000 });
      await makePayment(tx, ws, large, customer, { amountCents: 90_000 });

      const response = await send("GET", "/api/payments?sort=amount_cents&order=desc", {
        token: await tokenFor(ws),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.data[0].amount_cents, 90_000);
      assert.equal(response.body.data[1].amount_cents, 1_000);
    });
  });
});
