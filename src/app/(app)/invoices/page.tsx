import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { InvoicesTable } from "@/components/invoices/invoices-table";
import { LinkButton } from "@/components/invoicepilot/link-button";
import { PageHeader } from "@/components/invoicepilot/page-header";
import { Reveal } from "@/components/motion/reveal";
import { getInvoices } from "@/lib/api/invoices";
import { handleReadError } from "@/lib/api/client";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  // ponytail: the demo ledger is 460 invoices and the table pages in the
  // browser. Server-side paging when a workspace outgrows one request.
  const { data: invoices } = await getInvoices({
    limit: 500,
    sort: "due_date",
    order: "asc",
  }).catch(handleReadError);

  const openInvoices = invoices.filter((i) => i.status !== "draft" && i.status !== "paid");
  const outstanding = openInvoices.reduce((s, i) => s + i.balance_cents, 0);
  const overdue = invoices
    .filter((i) => i.is_overdue)
    .reduce((s, i) => s + i.balance_cents, 0);
  const today = new Date().toISOString();

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Reveal>
        <PageHeader
          title="Invoices"
          description={
            <>
              <span className="tnum text-foreground font-medium">
                {money(outstanding)}
              </span>{" "}
              outstanding across {openInvoices.length} open invoices ·{" "}
              <span className="tnum text-danger font-medium">
                {money(overdue)}
              </span>{" "}
              overdue
            </>
          }
          actions={
            <LinkButton size="sm" href="/invoices/new">
              <Plus className="size-3.5" />
              New invoice
            </LinkButton>
          }
        />
      </Reveal>

      <Reveal delay={0.04}>
        <InvoicesTable invoices={invoices} today={today} />
      </Reveal>
    </div>
  );
}
