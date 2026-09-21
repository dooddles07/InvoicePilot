import type { Metadata } from "next";

import { PipelineBoard } from "@/components/collections/pipeline-board";
import { PageHeader } from "@/components/invoicepilot/page-header";
import { Reveal } from "@/components/motion/reveal";
import { handleReadError } from "@/lib/api/client";
import { getPipeline } from "@/lib/api/collections";
import { COLLECTION_STAGES } from "@/lib/data";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "Collections" };

export default async function CollectionsPage() {
  // The board only carries the four fields a card shows; stage labels and
  // column order are UI config (COLLECTION_STAGES), grouping the API's flat
  // list is this page's job, not the backend's.
  const { data: invoices } = await getPipeline().catch(handleReadError);

  const columns = COLLECTION_STAGES.map(({ key, label }) => {
    const stageInvoices = invoices.filter((i) => i.stage === key);
    return {
      key,
      label,
      invoices: stageInvoices,
      total_cents: stageInvoices.reduce((s, i) => s + i.balance_cents, 0),
    };
  });

  const overdueInvoices = invoices.filter((i) => i.is_overdue);
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
