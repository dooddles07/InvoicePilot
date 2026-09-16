import assert from "node:assert/strict";
import { test } from "node:test";

import { applyPayment, markPaid, markReminded } from "./mutate.ts";

/** A minimal open invoice. Fields the mutation does not read are filled with
 *  values that make an accidental read obvious. */
const base = {
  id: "inv-1",
  workspace_id: "ws-1",
  number: "INV-1001",
  customer_id: "cus-1",
  customer_name: "Northwind Studio",
  status: "overdue" as const,
  risk: "high" as const,
  amount_cents: 120_000,
  paid_cents: 0,
  balance_cents: 120_000,
  issue_date: "2026-08-01",
  due_date: "2026-08-31",
  paid_date: null,
  days_overdue: 16,
  last_contacted_at: null,
  next_action: "Send a firm reminder",
  po_number: null,
  notes: null,
  items: [],
};

test("a full payment settles the invoice", () => {
  const result = applyPayment(base, 120_000, "2026-09-16");

  assert.equal(result.balance_cents, 0);
  assert.equal(result.paid_cents, 120_000);
  assert.equal(result.status, "paid");
  assert.equal(result.risk, "low");
  assert.equal(result.days_overdue, 0);
  assert.equal(result.paid_date, "2026-09-16");
});

test("a partial payment reduces the balance without settling", () => {
  const result = applyPayment(base, 45_000, "2026-09-16");

  assert.equal(result.balance_cents, 75_000);
  assert.equal(result.paid_cents, 45_000);
  assert.equal(result.status, "partially_paid");
  assert.equal(result.risk, "high");
  assert.equal(result.days_overdue, 16);
  assert.equal(result.paid_date, null);
});

test("an overpayment never drives the balance below zero", () => {
  const result = applyPayment(base, 500_000, "2026-09-16");

  assert.equal(result.balance_cents, 0);
  assert.equal(result.paid_cents, 120_000);
  assert.equal(result.status, "paid");
});

test("a second partial payment settles the remainder", () => {
  const once = applyPayment(base, 45_000, "2026-09-16");
  const twice = applyPayment(once, 75_000, "2026-09-17");

  assert.equal(twice.balance_cents, 0);
  assert.equal(twice.status, "paid");
  assert.equal(twice.paid_date, "2026-09-17");
});

test("marking paid settles whatever is outstanding", () => {
  const partial = applyPayment(base, 20_000, "2026-09-16");
  const result = markPaid(partial, "2026-09-16");

  assert.equal(result.balance_cents, 0);
  assert.equal(result.status, "paid");
});

test("the input invoice is never mutated", () => {
  applyPayment(base, 120_000, "2026-09-16");

  assert.equal(base.balance_cents, 120_000);
  assert.equal(base.status, "overdue");
});

test("a reminder stamps the contact date and nothing else", () => {
  const result = markReminded(base, "2026-09-16");

  assert.equal(result.last_contacted_at, "2026-09-16");
  assert.equal(result.status, "overdue");
  assert.equal(result.balance_cents, 120_000);
});
