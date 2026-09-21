import type { Metadata } from "next";

import { CustomersTable } from "@/components/customers/customers-table";
import { PageHeader } from "@/components/invoicepilot/page-header";
import { Reveal } from "@/components/motion/reveal";
import { handleReadError } from "@/lib/api/client";
import { getCustomers } from "@/lib/api/customers";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  // ponytail: the demo ledger is 40 customers and the table pages in the
  // browser, same ceiling and same upgrade path as the invoices table.
  const { data: customers } = await getCustomers({ limit: 200 }).catch(handleReadError);
  const outstanding = customers.reduce((s, c) => s + c.outstanding_cents, 0);
  const highRisk = customers.filter((c) => c.risk === "high").length;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Reveal>
        <PageHeader
          title="Customers"
          description={
            <>
              {customers.length} accounts ·{" "}
              <span className="tnum text-foreground font-medium">
                {money(outstanding)}
              </span>{" "}
              outstanding ·{" "}
              <span className="text-danger font-medium">{highRisk}</span> flagged
              high risk
            </>
          }
        />
      </Reveal>

      <Reveal delay={0.04}>
        <CustomersTable customers={customers} />
      </Reveal>
    </div>
  );
}
