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
import {
  currentUser,
  getAging,
  getAISummary,
  getAIInsights,
  getCashFlow,
  getKpis,
  getNeedsAttention,
  NOW,
} from "@/lib/data";
import { verifyDataset } from "@/lib/data/verify";
import type { CashFlowRange } from "@/lib/data";
import type { CashFlowPoint } from "@/types";

export const metadata: Metadata = { title: "Overview" };

function greeting(at: Date) {
  const hour = at.getUTCHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  // Fails loudly in development if the derived figures stop reconciling,
  // rather than rendering plausible-looking but wrong money.
  if (process.env.NODE_ENV !== "production") verifyDataset();

  const kpis = getKpis();
  const aging = getAging();
  const attention = getNeedsAttention(5);
  const insights = getAIInsights(3);
  const aiSummary = getAISummary();

  // All four ranges are precomputed on the server; switching a range on the
  // client is then instant and ships no extra request.
  const series = Object.fromEntries(
    (["7d", "30d", "90d", "12m"] as CashFlowRange[]).map((r) => [
      r,
      getCashFlow(r),
    ]),
  ) as Record<CashFlowRange, CashFlowPoint[]>;

  const firstName = currentUser.full_name.split(" ")[0];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Reveal>
        <PageHeader
          title={`${greeting(NOW)}, ${firstName}`}
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
          <AgingPanel buckets={aging} />
        </Reveal>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Reveal className="xl:col-span-2">
          <NeedsAttention items={attention} />
        </Reveal>
        <div className="xl:col-span-1">
          <AIInsights insights={insights} summary={aiSummary} />
        </div>
      </div>
    </div>
  );
}
