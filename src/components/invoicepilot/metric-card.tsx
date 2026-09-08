"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { useId } from "react";

import { CountUp } from "@/components/invoicepilot/count-up";
import { cn } from "@/lib/utils";

/**
 * The dashboard KPI card.
 *
 * `goodDirection` matters more than it looks: outstanding and overdue going
 * *down* is good news, collected going up is good news. Encoding that per
 * metric is the difference between a card that informs and a card that just
 * paints arrows green.
 */
export type MetricTone = "up-good" | "down-good";

const NEUTRAL_BAND = 0.5;

export function MetricCard({
  label,
  value,
  format,
  change,
  comparisonLabel = "vs last month",
  trend,
  tone,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  change: number;
  comparisonLabel?: string;
  trend: number[];
  tone: MetricTone;
}) {
  const gradientId = useId().replace(/:/g, "");
  const flat = Math.abs(change) < NEUTRAL_BAND;
  const rising = change > 0;
  const good = flat ? null : tone === "up-good" ? rising : !rising;

  const toneClass = flat
    ? "text-muted-foreground"
    : good
      ? "text-success"
      : "text-danger";
  const stroke = flat
    ? "var(--muted-foreground)"
    : good
      ? "var(--success)"
      : "var(--danger)";

  const Icon = flat ? ArrowRight : rising ? ArrowUpRight : ArrowDownRight;
  const data = trend.map((v, i) => ({ i, v }));

  return (
    <div className="bg-card shadow-e1 relative flex h-full flex-col overflow-hidden rounded-xl border">
      <div className="flex flex-col gap-2 p-3 sm:gap-3 sm:p-4">
        <p className="text-muted-foreground truncate text-caption font-medium sm:text-small">
          {label}
        </p>

        <p className="figure text-h2 leading-none font-semibold sm:text-h1">
          <CountUp value={value} format={format} />
        </p>

        <p className="flex flex-wrap items-baseline gap-x-1.5 text-caption">
          <span className={cn("inline-flex items-center gap-0.5 font-medium", toneClass)}>
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span className="tnum">
              {flat ? "No change" : `${Math.abs(change).toFixed(1)}%`}
            </span>
          </span>
          <span className="text-muted-foreground">{comparisonLabel}</span>
        </p>
      </div>

      {/* Sparkline is decoration for the eye and context for the number, so it
          is hidden from assistive tech — the figure and delta above carry it. */}
      <div className="h-9 w-full sm:h-12" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          {/* Recharts makes its surface focusable by default; a decorative
              sparkline must not become a tab stop. */}
          <AreaChart
            data={data}
            margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            accessibilityLayer={false}
            tabIndex={-1}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Area
              type="monotone"
              dataKey="v"
              stroke={stroke}
              strokeWidth={1.75}
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
