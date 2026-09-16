import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { sql, withRollback } from "./helpers/database.js";
import { makeCustomer, makeInvoice, makeWorkspace } from "./helpers/factories.js";

after(() => sql.end());

async function stats(tx, customerId) {
  const rows = await tx`
    SELECT * FROM customer_stats WHERE customer_id = ${customerId}
  `;
  return rows[0];
}

describe("customer_stats", () => {
  it("grades a customer with no history low", async () => {
    // Grading a brand-new customer 'high' would flag every account on the day
    // it is created, which trains people to ignore the badge.
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Brand New" });
      const row = await stats(tx, customer);
      assert.equal(row.risk, "low");
      assert.equal(row.risk_reason, "No payment history yet");
      assert.equal(row.outstanding_cents, 0);
      assert.equal(row.open_invoice_count, 0);
    });
  });

  it("sums outstanding and overdue separately", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Mixed" });
      await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        dueOffsetDays: -5,
      });
      await makeInvoice(tx, ws, customer, {
        amount: 40_000,
        dueOffsetDays: 20,
      });
      const row = await stats(tx, customer);
      assert.equal(row.outstanding_cents, 140_000);
      assert.equal(row.overdue_cents, 100_000);
      assert.equal(row.open_invoice_count, 2);
    });
  });

  it("counts the on-time rate over settled invoices only", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Settled" });
      // Three paid: two on time, one late.
      await makeInvoice(tx, ws, customer, {
        amount: 10_000, paid: 10_000,
        dueOffsetDays: -60, paidOffsetDays: -65, status: "paid",
      });
      await makeInvoice(tx, ws, customer, {
        amount: 10_000, paid: 10_000,
        dueOffsetDays: -50, paidOffsetDays: -52, status: "paid",
      });
      await makeInvoice(tx, ws, customer, {
        amount: 10_000, paid: 10_000,
        dueOffsetDays: -40, paidOffsetDays: -20, status: "paid",
      });
      assert.equal((await stats(tx, customer)).on_time_rate, 67); // 2 of 3, rounded
    });
  });

  it("grades a long overdue balance high", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Stale" });
      await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        dueOffsetDays: -90,
      });
      const row = await stats(tx, customer);
      assert.equal(row.risk, "high");
      assert.ok(
        row.risk_reason.includes("90 days past due"),
        `risk_reason was ${JSON.stringify(row.risk_reason)}`,
      );
    });
  });

  it("grades a slightly late balance medium", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Slipping" });
      await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        dueOffsetDays: -20,
      });
      assert.equal((await stats(tx, customer)).risk, "medium");
    });
  });

  it("never returns null for a customer without invoices", async () => {
    // NULL propagates through every downstream sum and percentage.
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Empty" });
      const row = await stats(tx, customer);
      for (const field of [
        "outstanding_cents",
        "overdue_cents",
        "total_invoiced_cents",
        "avg_days_to_pay",
        "on_time_rate",
        "open_invoice_count",
        "oldest_open_days",
      ]) {
        assert.notEqual(row[field], null, field);
      }
    });
  });
});
