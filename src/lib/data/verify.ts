import {
  getAging,
  getCashFlow,
  getKpis,
  getPipeline,
  invoices,
  openInvoices,
  payments,
} from "./index";
import { customers } from "./seed";

/**
 * Invariants for the derived dataset.
 *
 * The aggregation in `index.ts` is the one piece of real logic in the mockup —
 * if it drifts, every screen lies in a plausible-looking way. This runs in
 * development only (see the dashboard page) and throws loudly rather than
 * rendering wrong money.
 */
export function verifyDataset(): void {
  const fail = (msg: string): never => {
    throw new Error(`[demo data] ${msg}`);
  };

  // Money is integer cents everywhere.
  for (const inv of invoices) {
    if (!Number.isInteger(inv.amount_cents) || inv.amount_cents <= 0) {
      fail(`${inv.number} has a non-integer or non-positive amount`);
    }
    if (inv.balance_cents < 0 || inv.balance_cents > inv.amount_cents) {
      fail(`${inv.number} balance ${inv.balance_cents} is outside 0..amount`);
    }
    const lines = inv.items.reduce((s, i) => s + i.amount_cents, 0);
    if (lines !== inv.amount_cents) {
      fail(`${inv.number} line items sum to ${lines}, invoice is ${inv.amount_cents}`);
    }
    if (inv.status === "paid" && inv.balance_cents !== 0) {
      fail(`${inv.number} is paid but still carries a balance`);
    }
    if (inv.status !== "paid" && inv.paid_date) {
      fail(`${inv.number} has a paid date but is not marked paid`);
    }
  }

  // Aging partitions the open ledger exactly once.
  const aging = getAging();
  const agingTotal = aging.reduce((s, b) => s + b.amount_cents, 0);
  const openTotal = openInvoices.reduce((s, i) => s + i.balance_cents, 0);
  if (agingTotal !== openTotal) {
    fail(`aging buckets total ${agingTotal} but open balance is ${openTotal}`);
  }
  const agingCount = aging.reduce((s, b) => s + b.invoice_count, 0);
  if (agingCount !== openInvoices.length) {
    fail(`aging counts ${agingCount} invoices, expected ${openInvoices.length}`);
  }
  const share = aging.reduce((s, b) => s + b.share, 0);
  if (openTotal > 0 && Math.abs(share - 100) > 0.01) {
    fail(`aging shares sum to ${share.toFixed(3)}%, expected 100%`);
  }

  // The pipeline is the same partition, sliced by stage.
  const pipelineCount = getPipeline().reduce((s, c) => s + c.invoices.length, 0);
  if (pipelineCount !== openInvoices.length) {
    fail(`pipeline holds ${pipelineCount} invoices, expected ${openInvoices.length}`);
  }

  // Payments reconcile against the invoices that produced them.
  const paidOnInvoices = invoices.reduce((s, i) => s + i.paid_cents, 0);
  const paymentTotal = payments.reduce((s, p) => s + p.amount_cents, 0);
  if (paidOnInvoices !== paymentTotal) {
    fail(`payments total ${paymentTotal} but invoices record ${paidOnInvoices} paid`);
  }

  // Customer rollups match their own invoices.
  for (const c of customers) {
    const mine = invoices.filter((i) => i.customer_id === c.id);
    const expected = mine
      .filter((i) => i.status !== "paid" && i.status !== "draft")
      .reduce((s, i) => s + i.balance_cents, 0);
    if (expected !== c.outstanding_cents) {
      fail(`${c.name} outstanding ${c.outstanding_cents} != ledger ${expected}`);
    }
    if (c.on_time_rate < 0 || c.on_time_rate > 100) {
      fail(`${c.name} has an impossible on-time rate`);
    }
  }

  // KPIs are finite and self-consistent.
  const kpis = getKpis();
  for (const [key, value] of Object.entries(kpis)) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      fail(`KPI ${key} is not finite`);
    }
  }
  if (kpis.overdue_cents > kpis.outstanding_cents) {
    fail("overdue balance exceeds total outstanding");
  }

  // Every chart range produces a usable series.
  for (const range of ["7d", "30d", "90d", "12m"] as const) {
    const series = getCashFlow(range);
    if (series.length < 7) fail(`cash flow ${range} produced only ${series.length} points`);
    if (series.some((p) => !Number.isFinite(p.actual_cents))) {
      fail(`cash flow ${range} contains a non-finite value`);
    }
  }
}
