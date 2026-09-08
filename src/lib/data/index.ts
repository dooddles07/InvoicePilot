import type {
  AgingBucket,
  AgingBucketKey,
  AIAnswer,
  AIInsight,
  CashFlowPoint,
  CollectionEvent,
  CollectionStage,
  Customer,
  Invoice,
  KpiSummary,
  NeedsAttentionItem,
  Payment,
  UsageMeter,
} from "@/types";
import {
  automations,
  collectionEvents,
  currentUser,
  customerById,
  customers,
  integrations,
  invoices,
  NOW,
  payments,
  teamMembers,
  workspace,
  workspaces,
} from "./seed";

export {
  automations,
  collectionEvents,
  currentUser,
  customers,
  integrations,
  invoices,
  NOW,
  payments,
  teamMembers,
  workspace,
  workspaces,
};

const MS_DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * MS_DAY);
const ts = (iso: string) => Date.parse(iso);

/** Invoices that represent money the business is actually owed. */
export const OPEN_STATUSES: Invoice["status"][] = [
  "sent",
  "viewed",
  "partially_paid",
  "overdue",
  "disputed",
];

export const openInvoices = invoices.filter((i) =>
  OPEN_STATUSES.includes(i.status),
);

export const overdueInvoices = openInvoices.filter((i) => i.days_overdue > 0);

const sum = <T,>(xs: T[], f: (x: T) => number) =>
  xs.reduce((s, x) => s + f(x), 0);

/* ------------------------------------------------------------------ */
/* Point-in-time reconstruction                                        */
/*                                                                     */
/* Period-over-period comparisons are rebuilt from the ledger rather   */
/* than stored, so every "vs last month" figure is genuinely the same  */
/* calculation applied to an earlier date.                             */
/* ------------------------------------------------------------------ */

function outstandingAsOf(at: Date): number {
  return sum(
    invoices.filter(
      (i) =>
        i.status !== "draft" &&
        ts(i.issue_date) <= at.getTime() &&
        (!i.paid_date || ts(i.paid_date) > at.getTime()),
    ),
    (i) => i.amount_cents - (i.paid_date ? 0 : i.paid_cents),
  );
}

function overdueAsOf(at: Date): number {
  return sum(
    invoices.filter(
      (i) =>
        i.status !== "draft" &&
        ts(i.due_date) < at.getTime() &&
        (!i.paid_date || ts(i.paid_date) > at.getTime()),
    ),
    (i) => i.amount_cents - (i.paid_date ? 0 : i.paid_cents),
  );
}

function collectedBetween(from: Date, to: Date): number {
  return sum(
    payments.filter(
      (p) => ts(p.received_at) > from.getTime() && ts(p.received_at) <= to.getTime(),
    ),
    (p) => p.amount_cents,
  );
}

/** Share of the value falling due in a window that has actually been settled. */
function collectionRateFor(from: Date, to: Date): number {
  const due = invoices.filter(
    (i) =>
      i.status !== "draft" &&
      ts(i.due_date) > from.getTime() &&
      ts(i.due_date) <= to.getTime(),
  );
  const total = sum(due, (i) => i.amount_cents);
  if (!total) return 100;
  const settled = sum(due, (i) => (i.paid_date ? i.amount_cents : i.paid_cents));
  return (settled / total) * 100;
}

const pctChange = (now: number, before: number) =>
  before === 0 ? 0 : ((now - before) / before) * 100;

/** Twelve weekly readings, oldest first — enough shape for a sparkline. */
function weeklyTrend(read: (at: Date) => number): number[] {
  return Array.from({ length: 12 }, (_, i) =>
    Math.round(read(addDays(NOW, -(11 - i) * 7)) / 100),
  );
}

export function getKpis(): KpiSummary {
  const outstanding = outstandingAsOf(NOW);
  const overdue = overdueAsOf(NOW);
  // Rolling rather than calendar: on the 8th of a month, a month-to-date
  // figure says more about the date than about collections.
  const collected30d = collectedBetween(addDays(NOW, -30), NOW);

  const prior = addDays(NOW, -30);

  // Collection rate is measured on a window that has had time to settle:
  // scoring invoices that only fell due last week would report a failure that
  // is really just the payment terms doing their job.
  const collectionRate = collectionRateFor(addDays(NOW, -395), addDays(NOW, -30));

  return {
    outstanding_cents: outstanding,
    overdue_cents: overdue,
    collected_30d_cents: collected30d,
    collection_rate: collectionRate,
    outstanding_change: pctChange(outstanding, outstandingAsOf(prior)),
    overdue_change: pctChange(overdue, overdueAsOf(prior)),
    collected_change: pctChange(
      collected30d,
      collectedBetween(addDays(NOW, -60), addDays(NOW, -30)),
    ),
    collection_rate_change:
      collectionRate - collectionRateFor(addDays(NOW, -425), addDays(NOW, -60)),
    outstanding_trend: weeklyTrend(outstandingAsOf),
    overdue_trend: weeklyTrend(overdueAsOf),
    collected_trend: weeklyTrend((at) => collectedBetween(addDays(at, -7), at)),
    collection_rate_trend: weeklyTrend((at) =>
      Math.round(collectionRateFor(addDays(at, -395), addDays(at, -30)) * 100),
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Cash collection series                                              */
/* ------------------------------------------------------------------ */

export type CashFlowRange = "7d" | "30d" | "90d" | "12m";

const RANGE_LABEL: Record<CashFlowRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "12m": "12 months",
};

export const CASH_FLOW_RANGES = Object.entries(RANGE_LABEL).map(
  ([value, label]) => ({ value: value as CashFlowRange, label }),
);

export function getCashFlow(range: CashFlowRange): CashFlowPoint[] {
  if (range === "12m") {
    return Array.from({ length: 12 }, (_, i) => {
      const start = new Date(
        Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - (11 - i), 1),
      );
      const end = new Date(
        Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - (10 - i), 1),
      );
      return buildPoint(
        start,
        end,
        start.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      );
    });
  }

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  // Bucket width scales with the window so a point always holds enough
  // invoices to mean something instead of spiking between empty days.
  const bucketDays = range === "90d" ? 7 : range === "30d" ? 2 : 1;
  const buckets = Math.ceil(days / bucketDays);

  return Array.from({ length: buckets }, (_, i) => {
    const start = addDays(NOW, -(buckets - i) * bucketDays);
    const end = addDays(start, bucketDays);
    return buildPoint(
      start,
      end,
      start.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    );
  });
}

function buildPoint(start: Date, end: Date, label: string): CashFlowPoint {
  const inWindow = (iso: string | null) =>
    !!iso && ts(iso) > start.getTime() && ts(iso) <= end.getTime();

  const dueHere = invoices.filter(
    (i) => i.status !== "draft" && inWindow(i.due_date),
  );

  return {
    date: start.toISOString(),
    label,
    expected_cents: sum(dueHere, (i) => i.amount_cents),
    actual_cents: sum(
      payments.filter((p) => inWindow(p.received_at)),
      (p) => p.amount_cents,
    ),
    // Value that tipped into overdue during this window and is still unpaid.
    overdue_cents: sum(
      dueHere.filter((i) => !i.paid_date),
      (i) => i.balance_cents,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Aging                                                               */
/* ------------------------------------------------------------------ */

const AGING_DEFS: Array<{
  key: AgingBucketKey;
  label: string;
  test: (days: number) => boolean;
}> = [
  { key: "current", label: "Current", test: (d) => d <= 0 },
  { key: "1_30", label: "1–30 days", test: (d) => d >= 1 && d <= 30 },
  { key: "31_60", label: "31–60 days", test: (d) => d >= 31 && d <= 60 },
  { key: "61_90", label: "61–90 days", test: (d) => d >= 61 && d <= 90 },
  { key: "90_plus", label: "90+ days", test: (d) => d > 90 },
];

export function getAging(): AgingBucket[] {
  const total = sum(openInvoices, (i) => i.balance_cents) || 1;
  return AGING_DEFS.map(({ key, label, test }) => {
    const rows = openInvoices.filter((i) => test(i.days_overdue));
    const amount = sum(rows, (i) => i.balance_cents);
    return {
      key,
      label,
      amount_cents: amount,
      invoice_count: rows.length,
      share: (amount / total) * 100,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Collections pipeline                                                */
/* ------------------------------------------------------------------ */

export const COLLECTION_STAGES: Array<{
  key: CollectionStage;
  label: string;
  test: (days: number) => boolean;
}> = [
  { key: "upcoming", label: "Upcoming", test: (d) => d < 0 },
  { key: "due_today", label: "Due today", test: (d) => d === 0 },
  { key: "late_1_30", label: "1–30 days late", test: (d) => d >= 1 && d <= 30 },
  { key: "late_31_60", label: "31–60 days late", test: (d) => d >= 31 && d <= 60 },
  { key: "late_60_plus", label: "60+ days late", test: (d) => d > 60 },
];

export function getPipeline() {
  return COLLECTION_STAGES.map((stage) => {
    const items = openInvoices
      .filter((i) => stage.test(i.days_overdue))
      .sort((a, b) => b.balance_cents - a.balance_cents);
    return {
      ...stage,
      invoices: items,
      total_cents: sum(items, (i) => i.balance_cents),
    };
  });
}

export function stageOf(invoice: Invoice): CollectionStage {
  return (
    COLLECTION_STAGES.find((s) => s.test(invoice.days_overdue))?.key ??
    "upcoming"
  );
}

/* ------------------------------------------------------------------ */
/* Needs attention + AI                                                */
/* ------------------------------------------------------------------ */

const RISK_WEIGHT = { low: 1, medium: 1.6, high: 2.4 } as const;

/**
 * Expected recovery, not raw exposure.
 *
 * A big balance that has been dead for 200 days is worth less of your morning
 * than a slightly smaller one that just slipped — the chance of collecting
 * decays the longer an invoice sits. Ranking on value alone would fill the
 * queue with write-offs and bury the invoices a phone call would actually save.
 */
function recoveryScore(inv: Invoice): number {
  return (
    inv.balance_cents * RISK_WEIGHT[inv.risk] * Math.exp(-inv.days_overdue / 55)
  );
}

const rankedOverdue = [...overdueInvoices].sort(
  (a, b) => recoveryScore(b) - recoveryScore(a),
);

/**
 * You chase a customer, not an invoice. Showing three rows for the same
 * account turns a work queue into a list, so the queue keeps each customer's
 * highest-scoring invoice and drops the rest.
 */
const rankedByCustomer = rankedOverdue.filter(
  (inv, i, all) => all.findIndex((o) => o.customer_id === inv.customer_id) === i,
);

export function getNeedsAttention(limit = 5): NeedsAttentionItem[] {
  return rankedByCustomer.slice(0, limit).map((inv) => {
    const customer = customerById.get(inv.customer_id)!;
    return {
      invoice_id: inv.id,
      invoice_number: inv.number,
      customer_id: inv.customer_id,
      customer_name: inv.customer_name,
      balance_cents: inv.balance_cents,
      days_overdue: inv.days_overdue,
      risk: inv.risk,
      recommended_action: inv.next_action ?? "Send payment reminder",
      ai_note: aiNoteFor(inv, customer),
    };
  });
}

function aiNoteFor(inv: Invoice, customer: Customer): string | null {
  const contacted = inv.last_contacted_at
    ? Math.floor((NOW.getTime() - ts(inv.last_contacted_at)) / MS_DAY)
    : null;

  if (inv.status === "disputed") {
    return `A dispute is open on this invoice. Resolve the query before sending another reminder — chasing a disputed balance costs goodwill without moving the money.`;
  }
  if (inv.status === "partially_paid") {
    return `${customer.name} has already part-paid this invoice, so the intent is there. Ask for a date on the remaining ${fmt(inv.balance_cents)} rather than re-sending the whole demand.`;
  }
  if (customer.on_time_rate >= 75 && inv.days_overdue <= 14) {
    return `${customer.name} normally settles within ${customer.avg_days_to_pay} days of issue and pays on time ${customer.on_time_rate}% of the time. One friendly reminder is usually enough.`;
  }
  if (contacted !== null && contacted <= 2) {
    return `You contacted ${customer.contact_name} ${contacted === 0 ? "today" : `${contacted} day${contacted === 1 ? "" : "s"} ago`}. Give it another two working days before following up again — back-to-back chasing lowers the reply rate.`;
  }
  if (inv.days_overdue > 90) {
    return `At ${inv.days_overdue} days this is beyond what email recovers. Escalate to ${customer.contact_name} by phone, and agree a payment plan rather than a lump sum.`;
  }
  if (inv.days_overdue > 45) {
    return `Email alone rarely works past 45 days on this account. A call to ${customer.contact_name} is the higher-yield next step${
      contacted ? `; the last contact was ${contacted} days ago` : ""
    }.`;
  }
  if (customer.risk === "high") {
    return customer.on_time_rate === 0
      ? `${customer.name} has not settled a single invoice on time in the last year — average days-to-pay is ${customer.avg_days_to_pay} against ${customer.payment_terms_days}-day terms. Treat the due date as advisory and chase early.`
      : `On-time rate is down to ${customer.on_time_rate}% and average days-to-pay is now ${customer.avg_days_to_pay}. Contact today, while the balance is still inside the recoverable window.`;
  }
  const beyond = customer.avg_days_to_pay - customer.payment_terms_days;
  return beyond <= 0
    ? `This account normally pays on terms, so the delay is out of character. A short reminder naming the invoice number is usually all it takes.`
    : `This account usually pays ${beyond} day${beyond === 1 ? "" : "s"} beyond terms. A short, specific reminder naming the invoice number tends to be enough.`;
}

export function getAIInsights(limit = 3): AIInsight[] {
  return rankedByCustomer.slice(0, limit).map((inv, i) => {
    const customer = customerById.get(inv.customer_id)!;
    const escalate = inv.days_overdue > 30;
    return {
      id: `ai_${inv.id}`,
      workspace_id: workspace.id,
      priority: i + 1,
      customer_id: inv.customer_id,
      customer_name: inv.customer_name,
      invoice_id: inv.id,
      amount_cents: inv.balance_cents,
      headline: escalate
        ? `Payment is ${inv.days_overdue} days overdue`
        : customer.risk === "high"
          ? `High likelihood of further delay`
          : `Balance is slipping past terms`,
      // Invoice-specific rather than a customer boilerplate line: two entries
      // for two different accounts should never read the same way.
      reasoning: `${customer.name} settles on time ${customer.on_time_rate}% of the time and averages ${customer.avg_days_to_pay} days against ${customer.payment_terms_days}-day terms. This invoice is ${inv.days_overdue} days past due and accounts for ${Math.round(
        (inv.balance_cents / (overdueTotal() || 1)) * 100,
      )}% of your overdue balance.`,
      recommended_action: escalate ? "Send escalation" : "Contact today",
      action_kind: escalate ? "send_escalation" : "send_reminder",
      confidence: Math.min(0.95, 0.62 + inv.days_overdue / 220),
      created_at: NOW.toISOString(),
    };
  });
}

function overdueTotal() {
  return sum(overdueInvoices, (i) => i.balance_cents);
}

/** Headline numbers for the "AI Collection Insights" panel. */
export function getAISummary() {
  const recoverableThisWeek = sum(
    rankedOverdue.filter((i) => i.days_overdue <= 30 && i.risk !== "high"),
    (i) => i.balance_cents,
  );
  const atRisk = openInvoices.filter(
    (i) => i.days_overdue <= 0 && i.days_overdue > -7 && i.risk !== "low",
  );
  const needContact = new Set(
    rankedByCustomer
      .slice(0, 12)
      .filter((i) => i.risk === "high")
      .map((i) => i.customer_id),
  );
  return {
    recoverable_cents: recoverableThisWeek,
    at_risk_count: atRisk.length,
    contact_count: needContact.size,
  };
}

/* ------------------------------------------------------------------ */
/* Ask InvoicePilot — answers derived from the same ledger             */
/* ------------------------------------------------------------------ */

export const SUGGESTED_QUESTIONS = [
  "Why did our overdue balance increase?",
  "Which customers are most likely to pay late?",
  "How much did we collect this month?",
  "Which invoices should I prioritise?",
] as const;

export function answerFor(question: string): AIAnswer {
  const kpis = getKpis();
  const q = question.toLowerCase();

  const topContributors = rankedByCustomer.slice(0, 3).map((inv) => ({
    label: inv.customer_name,
    value_cents: inv.balance_cents,
    share: (inv.balance_cents / (overdueTotal() || 1)) * 100,
    href: `/invoices/${inv.id}`,
  }));

  if (q.includes("collect") && q.includes("month")) {
    return {
      id: "ans_collected",
      question,
      headline: `You have collected ${fmt(kpis.collected_30d_cents)} over the last 30 days.`,
      detail:
        "Measured against payments received, not invoices issued. The comparison is the same point in the previous month, so a short month does not flatter the number.",
      metrics: [
        { label: "Collected (30 days)", value: fmt(kpis.collected_30d_cents), direction: kpis.collected_change >= 0 ? "up" : "down" },
        { label: "Collection rate (30d)", value: `${kpis.collection_rate.toFixed(1)}%`, direction: kpis.collection_rate_change >= 0 ? "up" : "down" },
        { label: "Still outstanding", value: fmt(kpis.outstanding_cents), direction: null },
      ],
      contributors: payments
        .slice(0, 3)
        .map((p) => ({
          label: p.customer_name,
          value_cents: p.amount_cents,
          share: (p.amount_cents / (kpis.collected_30d_cents || 1)) * 100,
          href: `/invoices/${p.invoice_id}`,
        })),
      recommended_action: "Review the three largest open balances",
      action_kind: "flag_review",
      requires_confirmation: true,
    };
  }

  if (q.includes("likely") || q.includes("late")) {
    const risky = [...customers]
      .filter((c) => c.outstanding_cents > 0)
      .sort((a, b) => a.on_time_rate - b.on_time_rate)
      .slice(0, 3);
    return {
      id: "ans_risk",
      question,
      headline: `${risky.length} customers with open balances are trending toward late payment.`,
      detail:
        "Ranked by on-time rate over their full history, weighted by how much of your outstanding balance they hold.",
      metrics: risky.map((c) => ({
        label: c.name,
        value: `${c.on_time_rate}% on time`,
        direction: "down" as const,
      })),
      contributors: risky.map((c) => ({
        label: c.name,
        value_cents: c.outstanding_cents,
        share: (c.outstanding_cents / (kpis.outstanding_cents || 1)) * 100,
        href: `/customers/${c.id}`,
      })),
      recommended_action: `Send a pre-due reminder to ${risky[0]?.name ?? "the top account"}`,
      action_kind: "send_reminder",
      requires_confirmation: true,
    };
  }

  if (q.includes("priorit")) {
    return {
      id: "ans_priority",
      question,
      headline: `Work these three invoices first — they carry ${topContributors
        .reduce((s, c) => s + c.share, 0)
        .toFixed(0)}% of your overdue balance.`,
      detail:
        "Ranked by recoverable value weighted by risk, so a large low-risk balance does not outrank a smaller one that is genuinely slipping away.",
      metrics: rankedByCustomer.slice(0, 3).map((inv) => ({
        label: inv.number,
        value: `${fmt(inv.balance_cents)} · ${inv.days_overdue}d late`,
        direction: null,
      })),
      contributors: topContributors,
      recommended_action: `Contact ${topContributors[0]?.label ?? "the top account"} today`,
      action_kind: "send_reminder",
      requires_confirmation: true,
    };
  }

  return {
    id: "ans_overdue",
    question,
    headline: `Your overdue balance ${kpis.overdue_change >= 0 ? "increased" : "decreased"} by ${Math.abs(
      kpis.overdue_change,
    ).toFixed(0)}% this month, to ${fmt(kpis.overdue_cents)}.`,
    detail:
      "The change is driven by a small number of accounts rather than a broad slowdown, which means targeted follow-up will move the number more than a blanket reminder.",
    metrics: [
      { label: "Overdue balance", value: fmt(kpis.overdue_cents), direction: kpis.overdue_change >= 0 ? "up" : "down" },
      { label: "Overdue invoices", value: String(overdueInvoices.length), direction: null },
      { label: "Total outstanding", value: fmt(kpis.outstanding_cents), direction: kpis.outstanding_change >= 0 ? "up" : "down" },
    ],
    contributors: topContributors,
    recommended_action: `Prioritise ${topContributors[0]?.label ?? "the largest account"}`,
    action_kind: "send_reminder",
    requires_confirmation: true,
  };
}

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export function getInvoice(invoiceId: string): Invoice | undefined {
  return invoices.find((i) => i.id === invoiceId);
}

export function getCustomer(customerId: string): Customer | undefined {
  return customerById.get(customerId);
}

export function getCustomerInvoices(customerId: string): Invoice[] {
  return invoices
    .filter((i) => i.customer_id === customerId)
    .sort((a, b) => ts(b.issue_date) - ts(a.issue_date));
}

export function getInvoiceEvents(invoiceId: string): CollectionEvent[] {
  return collectionEvents.filter((e) => e.invoice_id === invoiceId);
}

export function getCustomerEvents(customerId: string): CollectionEvent[] {
  return collectionEvents.filter((e) => e.customer_id === customerId).slice(0, 20);
}

export function getCustomerPayments(customerId: string): Payment[] {
  return payments.filter((p) => p.customer_id === customerId);
}

/** Payment behaviour: average days beyond terms, by month, for a customer. */
export function getPaymentBehaviour(customerId: string) {
  const settled = getCustomerInvoices(customerId).filter((i) => i.paid_date);
  const byMonth = new Map<string, { late: number[]; label: string }>();
  for (const inv of settled) {
    const d = new Date(inv.paid_date!);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const label = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    const late = Math.round((ts(inv.paid_date!) - ts(inv.due_date)) / MS_DAY);
    const entry = byMonth.get(key) ?? { late: [], label };
    entry.late.push(late);
    byMonth.set(key, entry);
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([, v]) => ({
      label: v.label,
      days_beyond_terms: Math.round(
        v.late.reduce((s, x) => s + x, 0) / v.late.length,
      ),
    }));
}

export function getUsage(): UsageMeter[] {
  return [
    { label: "Invoices", used: invoices.length * 7 - 62, limit: 5000 },
    { label: "Customers", used: customers.length * 11 - 12, limit: 1000 },
    { label: "Automations", used: automations.length * 5 - 2, limit: 50 },
    { label: "AI actions", used: 742, limit: 2000 },
  ];
}

export function getTopCustomers(limit = 6): Customer[] {
  return [...customers]
    .sort((a, b) => b.outstanding_cents - a.outstanding_cents)
    .slice(0, limit);
}
