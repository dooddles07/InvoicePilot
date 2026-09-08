"use client";

import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, Sparkles } from "lucide-react";

import { useMotion, useMotionSafe } from "@/lib/motion";
import { cn } from "@/lib/utils";

const KPIS = [
  { label: "Outstanding", value: "$111,120", change: "19.1%", up: true, good: false },
  { label: "Overdue", value: "$40,540", change: "39.3%", up: true, good: false },
  { label: "Collected", value: "$43,740", change: "24.1%", up: false, good: false },
  { label: "Collection rate", value: "95.7%", change: "0.9", up: false, good: false },
];

const BARS = [38, 52, 31, 64, 44, 71, 49, 82, 58, 76, 63, 91];

/**
 * A dashboard preview built from real markup rather than a screenshot: it
 * stays sharp on any display, re-themes with the site, and cannot go stale
 * the next time the product changes. The figures match the demo workspace.
 */
export function HeroPreview() {
  const m = useMotion();
  const safe = useMotionSafe();

  return (
    <div
      aria-label="A preview of the InvoicePilot dashboard"
      role="img"
      className="bg-card shadow-e3 overflow-hidden rounded-2xl border"
    >
      <div className="bg-muted/40 flex items-center gap-1.5 border-b px-3 py-2">
        <span aria-hidden className="bg-danger/60 size-2 rounded-full" />
        <span aria-hidden className="bg-warning/60 size-2 rounded-full" />
        <span aria-hidden className="bg-success/60 size-2 rounded-full" />
        <span className="text-muted-foreground ml-2 text-caption">
          Overview · Meridian Studio
        </span>
      </div>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={m.container}
        className="space-y-3 p-3"
      >
        <motion.div variants={m.item} className="grid grid-cols-2 gap-2">
          {KPIS.map((kpi) => (
            <div key={kpi.label} className="rounded-lg border p-2.5">
              <p className="text-muted-foreground truncate text-caption">
                {kpi.label}
              </p>
              <p className="figure text-h3 leading-tight font-semibold">
                {kpi.value}
              </p>
              <p
                className={cn(
                  "flex items-center gap-0.5 text-caption font-medium",
                  kpi.good ? "text-success" : "text-danger",
                )}
              >
                {kpi.up ? (
                  <ArrowUpRight className="size-3" aria-hidden />
                ) : (
                  <ArrowDownRight className="size-3" aria-hidden />
                )}
                {kpi.change}
              </p>
            </div>
          ))}
        </motion.div>

        <motion.div variants={m.item} className="rounded-lg border p-2.5">
          <p className="text-muted-foreground text-caption">Cash collection</p>
          <div className="mt-2 flex h-20 items-end gap-1">
            {BARS.map((height, i) => (
              <motion.span
                key={i}
                aria-hidden
                className="bg-brand/70 flex-1 rounded-sm"
                // Height is data, so it is inline; the growth is animation, so
                // it is a transform and never triggers layout.
                style={{ height: `${height}%`, originY: 1 }}
                initial={safe ? { scaleY: 0 } : false}
                animate={{ scaleY: 1 }}
                transition={{
                  duration: 0.5,
                  delay: 0.2 + i * 0.03,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            ))}
          </div>
        </motion.div>

        <motion.div
          variants={m.item}
          className="border-brand/25 bg-brand-muted/50 rounded-lg border p-2.5"
        >
          <p className="text-brand flex items-center gap-1.5 text-caption font-medium">
            <Sparkles className="size-3" aria-hidden />
            Needs attention today
          </p>
          <ul className="mt-1.5 space-y-1">
            {[
              ["Summit Construction", "$3,600", "107d late"],
              ["Vertex Logistics", "$3,230", "56d late"],
              ["Acme Corporation", "$1,910", "27d late"],
            ].map(([name, amount, age]) => (
              <li key={name} className="flex items-baseline gap-2 text-caption">
                <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                <span className="text-danger">{age}</span>
                <span className="figure font-semibold">{amount}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      </motion.div>
    </div>
  );
}
