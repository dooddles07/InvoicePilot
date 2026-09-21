import type { Metadata } from "next";
import { CalendarDays, Download } from "lucide-react";

import { AgingPanel } from "@/components/dashboard/aging-panel";
import { AIInsights } from "@/components/dashboard/ai-insights";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { NeedsAttention } from "@/components/dashboard/needs-attention";
import { PageHeader } from "@/components/invoicepilot/page-header";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { handleReadError } from "@/lib/api/client";
import { getCollectionQueue, getInsights, getInsightsSummary } from "@/lib/api/collections";
import { getAging, getCashFlow, getSummary, type CashFlowRange } from "@/lib/api/reports";
import { requireSession } from "@/lib/api/session";
import type { CashFlowPoint } from "@/types";

export const metadata: Metadata = { title: "Overview" };

function greeting(at: Date) {
  const hour = at.getUTCHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const session = await requireSession();

  // All four cash-flow ranges are fetched once, up front: switching a range
  // on the client is then instant and ships no extra request, same intent
  // as the fixture ledger's "precompute all four" comment.
  const ranges: CashFlowRange[] = ["7d", "30d", "90d", "12m"];
  const [kpis, aging, attention, insights, aiSummary, ...cashFlowSeries] = await Promise.all([
    getSummary(),
    getAging(),
    getCollectionQueue(5),
    getInsights(3),
    getInsightsSummary(),
    ...ranges.map((r) => getCashFlow(r)),
  ]).catch(handleReadError);

  const series = Object.fromEntries(
    ranges.map((r, i) => [r, cashFlowSeries[i]]),
  ) as Record<CashFlowRange, CashFlowPoint[]>;

  const now = new Date();
  const firstName = session.full_name.split(" ")[0];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Reveal>
        <PageHeader
          title={`${greeting(now)}, ${firstName}`}
          description="Here's what needs your attention today."
          actions={
            <>
              <Button variant="outline" size="sm">
                <CalendarDays className="size-3.5" />
                Last 30 days
              </Button>
              <Button variant="outline" size="sm">
                <Download className="size-3.5" />
                Export
              </Button>
            </>
          }
        />
      </Reveal>

      <KpiGrid kpis={kpis} />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Reveal className="xl:col-span-2">
          <CashFlowChart series={series} />
        </Reveal>
        <Reveal delay={0.05}>
          <AgingPanel buckets={aging.buckets} />
        </Reveal>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Reveal className="xl:col-span-2">
          <NeedsAttention items={attention.data} />
        </Reveal>
        <div className="xl:col-span-1">
          <AIInsights insights={insights.data} summary={aiSummary} />
        </div>
      </div>
    </div>
  );
}
