import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { InvoicesTable } from "@/components/invoices/invoices-table";
import { LinkButton } from "@/components/invoicepilot/link-button";
import { PageHeader } from "@/components/invoicepilot/page-header";
import { Reveal } from "@/components/motion/reveal";
import { invoices, NOW, openInvoices, overdueInvoices } from "@/lib/data";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage() {
  const outstanding = openInvoices.reduce((s, i) => s + i.balance_cents, 0);
  const overdue = overdueInvoices.reduce((s, i) => s + i.balance_cents, 0);

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
        <InvoicesTable invoices={invoices} today={NOW.toISOString()} />
      </Reveal>
    </div>
  );
}
