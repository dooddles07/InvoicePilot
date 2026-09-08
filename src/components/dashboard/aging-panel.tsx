"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import Link from "next/link";

import { money, moneyCompact, percent } from "@/lib/format";
import { useMotionSafe } from "@/lib/motion";
import type { AgingBucket } from "@/types";

const BUCKET_COLOR: Record<AgingBucket["key"], string> = {
  current: "var(--aging-current)",
  "1_30": "var(--aging-1)",
  "31_60": "var(--aging-2)",
  "61_90": "var(--aging-3)",
  "90_plus": "var(--aging-4)",
};

/**
 * Aging answers "how bad is it, and where?" — so the bars carry the amount,
 * the count and the share at once, and the donut exists only to show the
 * proportion of the book that is still healthy.
 */
export function AgingPanel({ buckets }: { buckets: AgingBucket[] }) {
  const safe = useMotionSafe();
  const total = buckets.reduce((s, b) => s + b.amount_cents, 0);
  const atRisk = buckets
    .filter((b) => b.key !== "current")
    .reduce((s, b) => s + b.amount_cents, 0);

  return (
    <section
      aria-labelledby="aging-heading"
      className="bg-card shadow-e1 flex h-full flex-col rounded-xl border"
    >
      <header className="flex items-start justify-between gap-3 border-b p-4">
        <div className="space-y-1">
          <h2 id="aging-heading" className="text-h3 font-semibold tracking-tight">
            Invoice aging
          </h2>
          <p className="text-muted-foreground text-caption">
            {percent((atRisk / (total || 1)) * 100, 0)} of your open balance is
            past due.
          </p>
        </div>
        <Link
          href="/reports/aging"
          className="text-brand shrink-0 text-caption font-medium hover:underline"
        >
          Full report
        </Link>
      </header>

      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
        {/* Fixed size rather than responsive: the donut is a constant-size
            glyph, and a percentage-sized container measures 0 on first paint
            inside a flex column, which collapses the arcs. */}
        <div className="mx-auto shrink-0" aria-hidden>
          <PieChart width={140} height={140} accessibilityLayer={false} tabIndex={-1}>
            <Pie
              data={buckets}
              dataKey="amount_cents"
              nameKey="label"
              cx={69}
              cy={69}
              innerRadius={46}
              outerRadius={68}
              paddingAngle={2}
              stroke="none"
              isAnimationActive={safe}
              animationDuration={520}
            >
              {buckets.map((b) => (
                <Cell key={b.key} fill={BUCKET_COLOR[b.key]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 12,
                boxShadow: "var(--elev-2)",
                color: "var(--popover-foreground)",
              }}
              formatter={(value, name) => [money(Number(value)), String(name)]}
            />
          </PieChart>
        </div>

        <ul className="min-w-0 flex-1 space-y-2.5">
          {buckets.map((b) => (
            <li key={b.key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-caption">
                <span className="flex min-w-0 items-center gap-1.5 font-medium">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: BUCKET_COLOR[b.key] }}
                  />
                  <span className="truncate">{b.label}</span>
                  <span className="text-muted-foreground shrink-0 font-normal">
                    · {b.invoice_count}
                  </span>
                </span>
                <span className="tnum shrink-0 font-medium">
                  {moneyCompact(b.amount_cents)}
                </span>
              </div>
              <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.max(b.share, b.amount_cents > 0 ? 1.5 : 0)}%`,
                    background: BUCKET_COLOR[b.key],
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <footer className="text-muted-foreground mt-auto border-t px-4 py-2.5 text-caption">
        Total open balance{" "}
        <span className="tnum text-foreground font-medium">{money(total)}</span>
      </footer>
    </section>
  );
}
