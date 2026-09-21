/**
 * Ported from src/lib/data/verify.ts, the best test in the fixture ledger it
 * replaces: invariants that hold over any correctly-derived dataset, not
 * assertions about one specific scenario. If the aggregation in
 * models/reports.js or models/collections.js ever drifts, one of these
 * catches it structurally rather than requiring a hand-computed expected
 * value for every possible ledger shape.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import {
  getAgingBuckets,
  getAgingByCustomer,
  getCashFlowDays,
  getCashFlowMonths,
  getSummary,
} from "../src/models/reports.js";
import { listPipeline } from "../src/models/collections.js";
import { sql, withRollback } from "./helpers/database.js";
import { makeCustomer, makeInvoice, makePayment, makeWorkspace } from "./helpers/factories.js";

after(() => sql.end());

async function seedLedger(tx) {
  const ws = await makeWorkspace(tx);
  const a = await makeCustomer(tx, ws, { name: "Aging Co A", terms: 30 });
  const b = await makeCustomer(tx, ws, { name: "Aging Co B", terms: 30 });

  // A spread across every aging bucket, one paid, one draft (both excluded),
  // and one settled with a recorded payment for the reconciliation check.
  await makeInvoice(tx, ws, a, { amount: 10_000, dueOffsetDays: 10 }); // current
  await makeInvoice(tx, ws, a, { amount: 20_000, dueOffsetDays: -15 }); // 1-30
  await makeInvoice(tx, ws, b, { amount: 30_000, dueOffsetDays: -45 }); // 31-60
  await makeInvoice(tx, ws, b, { amount: 40_000, dueOffsetDays: -75 }); // 61-90
  await makeInvoice(tx, ws, a, { amount: 50_000, dueOffsetDays: -120 }); // 90+
  await makeInvoice(tx, ws, a, {
    amount: 60_000,
    status: "draft",
    dueOffsetDays: -120,
  });

  const settledId = await makeInvoice(tx, ws, b, {
    amount: 15_000,
    paid: 15_000,
    status: "paid",
    dueOffsetDays: -10,
    paidOffsetDays: -5,
  });
  await makePayment(tx, ws, settledId, b, { amountCents: 15_000, receivedOffsetDays: -5 });

  return ws;
}

describe("aging partitions the open ledger exactly once", () => {
  it("buckets sum to the same total and count as the open book", async () => {
    await withRollback(async (tx) => {
      const ws = await seedLedger(tx);

      const [buckets, pipeline] = await Promise.all([
        getAgingBuckets(tx, ws),
        listPipeline(tx, ws),
      ]);

      const agingTotal = buckets.reduce((s, b) => s + b.amount_cents, 0);
      const agingCount = buckets.reduce((s, b) => s + b.invoice_count, 0);
      const openTotal = pipeline.reduce((s, i) => s + i.balance_cents, 0);

      assert.equal(agingTotal, openTotal);
      assert.equal(agingCount, pipeline.length);

      const share = buckets.reduce((s, b) => s + Number(b.share), 0);
      assert.ok(Math.abs(share - 100) < 0.01, `shares summed to ${share}, expected 100`);
    });
  });

  it("includes every bucket even when one is empty", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Current Only Co" });
      // Only "current" has an invoice; the other four buckets must still
      // appear, at zero, rather than being dropped by a bare GROUP BY.
      await makeInvoice(tx, ws, customer, { amount: 10_000, dueOffsetDays: 10 });

      const buckets = await getAgingBuckets(tx, ws);
      assert.deepEqual(
        buckets.map((b) => b.key),
        ["current", "1_30", "31_60", "61_90", "90_plus"],
      );
      assert.equal(buckets.find((b) => b.key === "1_30").amount_cents, 0);
    });
  });

  it("the per-customer breakdown totals match the bucket totals", async () => {
    await withRollback(async (tx) => {
      const ws = await seedLedger(tx);
      const [buckets, byCustomer] = await Promise.all([
        getAgingBuckets(tx, ws),
        getAgingByCustomer(tx, ws),
      ]);

      const bucketTotal = buckets.reduce((s, b) => s + b.amount_cents, 0);
      const customerTotal = byCustomer.reduce((s, c) => s + c.total_cents, 0);
      assert.equal(customerTotal, bucketTotal);
    });
  });
});

describe("payments reconcile against the invoices that produced them", () => {
  it("SUM(payments) equals SUM(invoices.paid_cents) for the workspace", async () => {
    await withRollback(async (tx) => {
      const ws = await seedLedger(tx);
      const [[{ paid_total }], [{ payment_total }]] = await Promise.all([
        tx`SELECT COALESCE(SUM(paid_cents), 0)::bigint AS paid_total FROM invoices WHERE workspace_id = ${ws}`,
        tx`SELECT COALESCE(SUM(amount_cents), 0)::bigint AS payment_total FROM payments WHERE workspace_id = ${ws}`,
      ]);
      assert.equal(payment_total, paid_total);
    });
  });
});

describe("the KPI summary is self-consistent", () => {
  it("overdue never exceeds outstanding, and every figure is finite", async () => {
    await withRollback(async (tx) => {
      const ws = await seedLedger(tx);
      const kpis = await getSummary(tx, ws);

      for (const [key, value] of Object.entries(kpis)) {
        if (typeof value === "number") {
          assert.ok(Number.isFinite(value), `${key} is not finite`);
        }
        if (Array.isArray(value)) {
          for (const v of value) assert.ok(Number.isFinite(v), `${key} contains a non-finite value`);
        }
      }
      assert.ok(kpis.overdue_cents <= kpis.outstanding_cents);
    });
  });
});

describe("every cash flow range produces a usable series", () => {
  it("7d, 30d and 90d each produce their fixed bucket count, all finite", async () => {
    await withRollback(async (tx) => {
      const ws = await seedLedger(tx);
      for (const [bucketDays, bucketCount] of [
        [1, 7],
        [2, 15],
        [7, 13],
      ]) {
        const series = await getCashFlowDays(tx, ws, bucketDays, bucketCount);
        assert.equal(series.length, bucketCount);
        for (const point of series) {
          assert.ok(Number.isFinite(Number(point.actual_cents)));
        }
      }
    });
  });

  it("12m produces 12 calendar months, all finite", async () => {
    await withRollback(async (tx) => {
      const ws = await seedLedger(tx);
      const series = await getCashFlowMonths(tx, ws);
      assert.equal(series.length, 12);
      for (const point of series) {
        assert.ok(Number.isFinite(Number(point.actual_cents)));
      }
    });
  });
});
