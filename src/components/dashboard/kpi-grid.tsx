"use client";

import { MetricCard } from "@/components/invoicepilot/metric-card";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { moneyWhole, percent } from "@/lib/format";
import type { KpiSummary } from "@/types";

export function KpiGrid({ kpis }: { kpis: KpiSummary }) {
  // Two-up from the smallest screen: all four headline figures stay above the
  // fold on a phone, which is the whole point of the row.
  return (
    <Stagger className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StaggerItem>
        <MetricCard
          label="Outstanding"
          value={kpis.outstanding_cents}
          format={moneyWhole}
          change={kpis.outstanding_change}
          trend={kpis.outstanding_trend}
          tone="down-good"
        />
      </StaggerItem>
      <StaggerItem>
        <MetricCard
          label="Overdue"
          value={kpis.overdue_cents}
          format={moneyWhole}
          change={kpis.overdue_change}
          trend={kpis.overdue_trend}
          tone="down-good"
        />
      </StaggerItem>
      <StaggerItem>
        <MetricCard
          label="Collected (30 days)"
          value={kpis.collected_30d_cents}
          format={moneyWhole}
          change={kpis.collected_change}
          trend={kpis.collected_trend}
          tone="up-good"
        />
      </StaggerItem>
      <StaggerItem>
        <MetricCard
          label="Collection rate"
          value={kpis.collection_rate}
          format={(n) => percent(n)}
          change={kpis.collection_rate_change}
          comparisonLabel="pts vs prior year"
          trend={kpis.collection_rate_trend}
          tone="up-good"
        />
      </StaggerItem>
    </Stagger>
  );
}
