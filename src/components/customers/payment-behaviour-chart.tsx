"use client";

import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useMotionSafe } from "@/lib/motion";

/**
 * Days beyond terms, by month. Zero is the line that matters, so it is drawn
 * explicitly and bars are coloured by which side of it they fall on — early
 * payment is not a smaller version of late payment, it is the opposite.
 */
export function PaymentBehaviourChart({
  data,
}: {
  data: { label: string; days_beyond_terms: number }[];
}) {
  const safe = useMotionSafe();

  if (data.length < 2) {
    return (
      <p className="text-muted-foreground text-small">
        Not enough settled invoices yet to show a payment trend.
      </p>
    );
  }

  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}d`}
          />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeWidth={1} />
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
            formatter={(value) => {
              const v = Number(value);
              return [
                v > 0
                  ? `${v} days late`
                  : v < 0
                    ? `${Math.abs(v)} days early`
                    : "on the due date",
                "Settled",
              ];
            }}
          />
          <Bar
            dataKey="days_beyond_terms"
            radius={[3, 3, 0, 0]}
            maxBarSize={26}
            isAnimationActive={safe}
            animationDuration={480}
          >
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={
                  d.days_beyond_terms > 7
                    ? "var(--danger)"
                    : d.days_beyond_terms > 0
                      ? "var(--warning)"
                      : "var(--success)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
