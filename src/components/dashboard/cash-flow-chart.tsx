"use client";

import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { CASH_FLOW_RANGES, type CashFlowRange } from "@/lib/data";
import { moneyCompact, money } from "@/lib/format";
import { useMotionSafe } from "@/lib/motion";
import type { CashFlowPoint } from "@/types";
import { cn } from "@/lib/utils";

const SERIES = [
  { key: "expected_cents", label: "Expected", color: "var(--chart-1)" },
  { key: "actual_cents", label: "Collected", color: "var(--chart-2)" },
  { key: "overdue_cents", label: "Overdue", color: "var(--chart-4)" },
] as const;

export function CashFlowChart({
  series,
}: {
  series: Record<CashFlowRange, CashFlowPoint[]>;
}) {
  const [range, setRange] = useState<CashFlowRange>("30d");
  const safe = useMotionSafe();
  const data = series[range];

  const totals = useMemo(
    () =>
      data.reduce(
        (acc, p) => ({
          expected: acc.expected + p.expected_cents,
          actual: acc.actual + p.actual_cents,
          overdue: acc.overdue + p.overdue_cents,
        }),
        { expected: 0, actual: 0, overdue: 0 },
      ),
    [data],
  );

  return (
    <section
      aria-labelledby="cash-collection-heading"
      className="bg-card shadow-e1 rounded-xl border"
    >
      <header className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2
            id="cash-collection-heading"
            className="text-h3 font-semibold tracking-tight"
          >
            Cash collection
          </h2>
          <p className="text-muted-foreground text-caption">
            Expected against collected, with the value that fell overdue in the
            same window.
          </p>
        </div>

        <div
          role="group"
          aria-label="Date range"
          className="bg-muted flex shrink-0 rounded-lg p-0.5"
        >
          {CASH_FLOW_RANGES.map((r) => (
            <Button
              key={r.value}
              size="xs"
              variant="ghost"
              aria-pressed={range === r.value}
              onClick={() => setRange(r.value)}
              className={cn(
                "rounded-[7px] px-2",
                range === r.value &&
                  "bg-card text-foreground shadow-e1 hover:bg-card",
              )}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </header>

      <dl className="grid grid-cols-3 divide-x border-b">
        {SERIES.map((s, i) => (
          <div key={s.key} className="px-4 py-3">
            <dt className="text-muted-foreground flex items-center gap-1.5 text-caption">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ background: s.color }}
              />
              {s.label}
            </dt>
            <dd className="figure mt-0.5 text-h3 font-semibold">
              {moneyCompact(
                [totals.expected, totals.actual, totals.overdue][i] ?? 0,
              )}
            </dd>
          </div>
        ))}
      </dl>

      <div className="h-[260px] w-full p-3 sm:h-[300px] sm:p-4">
        <ResponsiveContainer width="100%" height="100%">
          {/* `key` on the range forces a fresh mount so the series redraws
              rather than morphing between two unrelated time bases. */}
          <ComposedChart
            key={range}
            data={data}
            margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
          >
            <defs>
              <linearGradient id="ip-expected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              minTickGap={16}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={64}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={(v: number) => moneyCompact(v)}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 12,
                boxShadow: "var(--elev-2)",
                color: "var(--popover-foreground)",
              }}
              labelStyle={{ color: "var(--muted-foreground)", marginBottom: 4 }}
              formatter={(value, name) => [money(Number(value)), String(name)]}
            />
            <Legend
              verticalAlign="bottom"
              height={28}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
            />
            <Area
              type="monotone"
              dataKey="expected_cents"
              name="Expected"
              stroke="var(--chart-1)"
              strokeWidth={1.75}
              fill="url(#ip-expected)"
              isAnimationActive={safe}
              animationDuration={520}
              dot={false}
            />
            <Bar
              dataKey="overdue_cents"
              name="Overdue"
              fill="var(--chart-4)"
              radius={[3, 3, 0, 0]}
              maxBarSize={22}
              isAnimationActive={safe}
              animationDuration={520}
            />
            <Line
              type="monotone"
              dataKey="actual_cents"
              name="Collected"
              stroke="var(--chart-2)"
              strokeWidth={2.25}
              dot={false}
              isAnimationActive={safe}
              animationDuration={620}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
