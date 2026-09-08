import type { Metadata } from "next";

import { PageHeader } from "@/components/invoicepilot/page-header";
import { PaymentsTable } from "@/components/payments/payments-table";
import { Reveal } from "@/components/motion/reveal";
import { getKpis, payments } from "@/lib/data";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsPage() {
  const kpis = getKpis();

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Reveal>
        <PageHeader
          title="Payments"
          description={
            <>
              <span className="tnum text-foreground font-medium">
                {money(kpis.collected_30d_cents)}
              </span>{" "}
              received in the last 30 days · {payments.length} payments on record
            </>
          }
        />
      </Reveal>

      <Reveal delay={0.04}>
        <PaymentsTable payments={payments} />
      </Reveal>
    </div>
  );
}
