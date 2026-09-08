import type { Metadata } from "next";

import { PipelineBoard } from "@/components/collections/pipeline-board";
import { PageHeader } from "@/components/invoicepilot/page-header";
import { Reveal } from "@/components/motion/reveal";
import { getPipeline, overdueInvoices } from "@/lib/data";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "Collections" };

export default function CollectionsPage() {
  // The board only carries the four fields a card shows, but the stages are
  // computed from the same ledger the dashboard aging report uses.
  const columns = getPipeline().map(({ key, label, invoices, total_cents }) => ({
    key,
    label,
    invoices,
    total_cents,
  }));

  const overdue = overdueInvoices.reduce((s, i) => s + i.balance_cents, 0);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <Reveal>
        <PageHeader
          title="Collections"
          description={
            <>
              <span className="tnum text-danger font-medium">
                {money(overdue)}
              </span>{" "}
              across {overdueInvoices.length} overdue invoices. Drag a card, or
              use its move menu, to change stage.
            </>
          }
        />
      </Reveal>

      <Reveal delay={0.04}>
        <PipelineBoard columns={columns} />
      </Reveal>
    </div>
  );
}
