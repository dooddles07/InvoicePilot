import Link from "next/link";
import { ArrowRight, PartyPopper, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/invoicepilot/empty-state";
import { RiskBadge } from "@/components/invoicepilot/status-badge";
import { LinkButton } from "@/components/invoicepilot/link-button";
import { money } from "@/lib/format";
import type { NeedsAttentionItem } from "@/types";

/**
 * The dashboard's answer to "who should I contact today?". Ranked by
 * recoverable value weighted by risk, so the list is a work queue rather than
 * a leaderboard of the biggest numbers.
 */
export function NeedsAttention({ items }: { items: NeedsAttentionItem[] }) {
  return (
    <section
      aria-labelledby="needs-attention-heading"
      className="bg-card shadow-e1 flex h-full flex-col rounded-xl border"
    >
      <header className="flex items-center justify-between gap-3 border-b p-4">
        <div className="space-y-1">
          <h2
            id="needs-attention-heading"
            className="text-h3 font-semibold tracking-tight"
          >
            Needs attention
          </h2>
          <p className="text-muted-foreground text-caption">
            Ranked by how much you can realistically recover today.
          </p>
        </div>
        <Link
          href="/collections"
          className="text-brand shrink-0 text-caption font-medium hover:underline"
        >
          View all
        </Link>
      </header>

      {items.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={PartyPopper}
            tone="positive"
            title="Nothing needs chasing"
            description="Great news — you have no overdue invoices. InvoicePilot will surface anything that slips."
          />
        </div>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li
              key={item.invoice_id}
              className="hover:bg-muted/40 flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-start"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/customers/${item.customer_id}`}
                    className="truncate text-small font-semibold hover:underline"
                  >
                    {item.customer_name}
                  </Link>
                  <RiskBadge risk={item.risk} />
                </div>

                <p className="text-small">
                  <span className="figure text-danger font-semibold">
                    {money(item.balance_cents)}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    overdue · {item.days_overdue} days late ·{" "}
                    <Link
                      href={`/invoices/${item.invoice_id}`}
                      className="hover:underline"
                    >
                      {item.invoice_number}
                    </Link>
                  </span>
                </p>

                {item.ai_note ? (
                  <p className="text-muted-foreground flex gap-1.5 text-caption">
                    <Sparkles
                      className="text-brand mt-0.5 size-3 shrink-0"
                      aria-hidden
                    />
                    <span>{item.ai_note}</span>
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                <LinkButton size="sm" href={`/invoices/${item.invoice_id}`}>
                  {item.recommended_action}
                  <ArrowRight className="size-3.5" />
                </LinkButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
