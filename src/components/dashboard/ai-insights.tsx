import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";

import { LinkButton } from "@/components/invoicepilot/link-button";
import { Reveal } from "@/components/motion/reveal";
import { money, moneyWhole } from "@/lib/format";
import type { AIInsight } from "@/types";

/**
 * The AI panel earns its place by doing the ranking a person would otherwise
 * do by hand — and it stops at a recommendation. Nothing here sends an email;
 * every action routes through the invoice, where a human confirms it.
 */
export function AIInsights({
  insights,
  summary,
}: {
  insights: AIInsight[];
  summary: { recoverable_cents: number; at_risk_count: number; contact_count: number };
}) {
  const stats = [
    {
      value: moneyWhole(summary.recoverable_cents),
      label: "Potentially recoverable this week",
    },
    {
      value: `${summary.at_risk_count} invoices`,
      label: "Likely to become overdue",
    },
    {
      value: `${summary.contact_count} customers`,
      label: "Require immediate follow-up",
    },
  ];

  return (
    <Reveal>
      <section
        aria-labelledby="ai-insights-heading"
        className="border-brand/25 from-brand-muted/70 shadow-e1 overflow-hidden rounded-xl border bg-gradient-to-b to-transparent"
      >
        <header className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="flex gap-2.5">
            <span className="bg-brand/12 text-brand mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div className="space-y-1">
              <h2
                id="ai-insights-heading"
                className="text-h3 font-semibold tracking-tight"
              >
                AI collection insights
              </h2>
              <p className="text-muted-foreground text-caption">
                InvoicePilot analysed your outstanding receivables this morning.
              </p>
            </div>
          </div>
          <LinkButton size="sm" variant="outline" href="/ai">
            Ask InvoicePilot
            <ArrowUpRight className="size-3.5" />
          </LinkButton>
        </header>

        {/* Stacked rows rather than three columns: this panel lives in a
            one-third column on wide screens, where side-by-side stats wrap
            mid-word. */}
        <dl className="divide-brand/15 border-brand/15 divide-y border-y">
          {stats.map((s) => (
            <div
              key={s.label}
              className="bg-card/60 flex items-baseline justify-between gap-3 px-4 py-2.5"
            >
              <dd className="figure text-h3 shrink-0 font-semibold">{s.value}</dd>
              <dt className="text-muted-foreground text-right text-caption">
                {s.label}
              </dt>
            </div>
          ))}
        </dl>

        <ol className="divide-brand/12 bg-card/40 divide-y">
          {insights.map((insight) => (
            <li
              key={insight.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start"
            >
              <span className="bg-brand text-brand-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold">
                {insight.priority}
              </span>

              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <Link
                    href={`/customers/${insight.customer_id}`}
                    className="text-small font-semibold hover:underline"
                  >
                    {insight.customer_name}
                  </Link>
                  <span className="figure text-small font-semibold">
                    {money(insight.amount_cents)}
                  </span>
                </p>
                <p className="text-small">{insight.headline}</p>
                <p className="text-muted-foreground text-caption">
                  {insight.reasoning}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                <LinkButton
                  size="sm"
                  variant="outline"
                  href={`/invoices/${insight.invoice_id}`}
                >
                  {insight.recommended_action}
                </LinkButton>
                <span className="text-muted-foreground text-caption">
                  {Math.round(insight.confidence * 100)}% confidence
                </span>
              </div>
            </li>
          ))}
        </ol>

        <p className="text-muted-foreground border-brand/15 border-t px-4 py-2.5 text-caption">
          Recommendations only. InvoicePilot never sends a message or records a
          payment without your confirmation.
        </p>
      </section>
    </Reveal>
  );
}
