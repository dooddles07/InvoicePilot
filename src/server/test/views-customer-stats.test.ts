import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { withRollback, type Tx } from "./database";
import { makeCustomer, makeInvoice, makeWorkspace } from "./factories";

type Stats = {
  risk: string;
  risk_reason: string;
  outstanding_cents: string;
  overdue_cents: string;
  total_invoiced_cents: string;
  avg_days_to_pay: number;
  on_time_rate: number;
  open_invoice_count: number;
  oldest_open_days: number;
};

async function stats(tx: Tx, customerId: string): Promise<Stats> {
  const rows = await tx.execute<Stats>(
    sql`SELECT * FROM customer_stats WHERE customer_id = ${customerId}`,
  );
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
      expect(row.risk).toBe("low");
      expect(row.risk_reason).toBe("No payment history yet");
      expect(Number(row.outstanding_cents)).toBe(0);
      expect(row.open_invoice_count).toBe(0);
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
      expect(Number(row.outstanding_cents)).toBe(140_000);
      expect(Number(row.overdue_cents)).toBe(100_000);
      expect(row.open_invoice_count).toBe(2);
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
      expect((await stats(tx, customer)).on_time_rate).toBe(67); // 2 of 3, rounded
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
      expect(row.risk).toBe("high");
      expect(row.risk_reason).toContain("90 days past due");
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
      expect((await stats(tx, customer)).risk).toBe("medium");
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
      ] as const) {
        expect(row[field], field).not.toBeNull();
      }
    });
  });
});
