/**
 * Ask InvoicePilot. Ported from answerFor() in the frontend fixtures
 * (src/lib/data/index.ts), keyword branch for keyword branch -- this is a
 * rules engine over real aggregates, not a model call, and the page says so.
 *
 * Every aggregate below is a model function another domain already owns and
 * already tests; this file's only job is the same four `if` branches the
 * fixture had, read against real numbers instead of an in-memory ledger.
 */
import { getOverdueTotal, listQueue } from "../models/collections.js";
import { listCustomers } from "../models/customers.js";
import { listInvoices } from "../models/invoices.js";
import { listPayments } from "../models/payments.js";
import { getSummary } from "../models/reports.js";

function money(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export async function answerFor(sql, workspaceId, question) {
  const q = question.toLowerCase();

  const [kpis, rankedByCustomer, overdueTotalCents, recentPayments, riskCandidates, overdueCount] =
    await Promise.all([
      getSummary(sql, workspaceId),
      listQueue(sql, workspaceId, 12),
      getOverdueTotal(sql, workspaceId),
      listPayments(sql, workspaceId, { limit: 3, offset: 0, sort: "received_at", order: "desc" }),
      listCustomers(sql, workspaceId, { limit: 100, offset: 0, sort: "on_time_rate", order: "asc" }),
      listInvoices(sql, workspaceId, { limit: 1, offset: 0, sort: "due_date", order: "desc", overdue: true }),
    ]);

  // Contributors are ranked by exposure, largest first -- a list headed "main
  // contributors" that runs 5%, 5%, 8% reads as a bug, whatever the ordering
  // meant. The recommendation below still follows the recovery ranking, and
  // says so.
  const topContributors = [...rankedByCustomer]
    .sort((a, b) => b.balance_cents - a.balance_cents)
    .slice(0, 3)
    .map((inv) => ({
      label: inv.customer_name,
      value_cents: inv.balance_cents,
      share: (inv.balance_cents / (overdueTotalCents || 1)) * 100,
      href: `/invoices/${inv.invoice_id}`,
    }));

  const bestNext = rankedByCustomer[0];

  if (q.includes("collect") && q.includes("month")) {
    return {
      id: "ans_collected",
      question,
      headline: `You have collected ${money(kpis.collected_30d_cents)} over the last 30 days.`,
      detail:
        "Measured against payments received, not invoices issued. The comparison is the same point in the previous month, so a short month does not flatter the number.",
      metrics: [
        { label: "Collected (30 days)", value: money(kpis.collected_30d_cents), direction: kpis.collected_change >= 0 ? "up" : "down" },
        { label: "Collection rate (30d)", value: `${kpis.collection_rate.toFixed(1)}%`, direction: kpis.collection_rate_change >= 0 ? "up" : "down" },
        { label: "Still outstanding", value: money(kpis.outstanding_cents), direction: null },
      ],
      contributors: recentPayments.data.map((p) => ({
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
    const risky = riskCandidates.data.filter((c) => c.outstanding_cents > 0).slice(0, 3);
    return {
      id: "ans_risk",
      question,
      headline: `${risky.length} customers with open balances are trending toward late payment.`,
      detail:
        "Ranked by on-time rate over their full history, weighted by how much of your outstanding balance they hold.",
      metrics: risky.map((c) => ({
        label: c.name,
        value: `${c.on_time_rate}% on time`,
        direction: "down",
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
      headline: `Three invoices carry ${topContributors
        .reduce((s, c) => s + c.share, 0)
        .toFixed(0)}% of your overdue balance.`,
      detail:
        "Ranked by recoverable value weighted by risk, so a large low-risk balance does not outrank a smaller one that is genuinely slipping away.",
      metrics: rankedByCustomer.slice(0, 3).map((inv) => ({
        label: inv.number,
        value: `${money(inv.balance_cents)} · ${inv.days_overdue}d late`,
        direction: null,
      })),
      contributors: topContributors,
      recommended_action: `Contact ${bestNext?.customer_name ?? "the top account"} today`,
      action_kind: "send_reminder",
      requires_confirmation: true,
    };
  }

  return {
    id: "ans_overdue",
    question,
    headline: `Your overdue balance ${kpis.overdue_change >= 0 ? "increased" : "decreased"} by ${Math.abs(
      kpis.overdue_change,
    ).toFixed(0)}% this month, to ${money(kpis.overdue_cents)}.`,
    detail:
      "The change is driven by a small number of accounts rather than a broad slowdown, which means targeted follow-up will move the number more than a blanket reminder.",
    metrics: [
      { label: "Overdue balance", value: money(kpis.overdue_cents), direction: kpis.overdue_change >= 0 ? "up" : "down" },
      { label: "Overdue invoices", value: String(overdueCount.total), direction: null },
      { label: "Total outstanding", value: money(kpis.outstanding_cents), direction: kpis.outstanding_change >= 0 ? "up" : "down" },
    ],
    contributors: topContributors,
    recommended_action: `Start with ${bestNext?.customer_name ?? "the largest account"} — best chance of recovery today`,
    action_kind: "send_reminder",
    requires_confirmation: true,
  };
}
