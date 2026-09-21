import type { Metadata } from "next";

import { PageHeader } from "@/components/invoicepilot/page-header";
import { PaymentsTable } from "@/components/payments/payments-table";
import { Reveal } from "@/components/motion/reveal";
import { handleReadError } from "@/lib/api/client";
import { getPayments } from "@/lib/api/payments";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  // ponytail: the demo ledger is 398 payments and the table pages in the
  // browser, same ceiling and same upgrade path as the invoices table.
  const { data: payments, total } = await getPayments({
    limit: 500,
    sort: "received_at",
    order: "desc",
  }).catch(handleReadError);

  const since = new Date().getTime() - 30 * 24 * 60 * 60 * 1000;
  const collected30d = payments
    .filter((p) => new Date(p.received_at).getTime() >= since)
    .reduce((s, p) => s + p.amount_cents, 0);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Reveal>
        <PageHeader
          title="Payments"
          description={
            <>
              <span className="tnum text-foreground font-medium">
                {money(collected30d)}
              </span>{" "}
              received in the last 30 days · {total} payments on record
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
