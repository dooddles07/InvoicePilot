import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

import { AgingPanel } from "@/components/dashboard/aging-panel";
import { CustomerCell } from "@/components/invoicepilot/customer-cell";
import { PageHeader } from "@/components/invoicepilot/page-header";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { handleReadError } from "@/lib/api/client";
import { getAging } from "@/lib/api/reports";
import { money, percent } from "@/lib/format";

export const metadata: Metadata = { title: "Accounts receivable aging" };

const BUCKET_LABELS = ["Current", "1–30", "31–60", "61–90", "90+"] as const;

export default async function AgingReportPage() {
  const { buckets, by_customer: rows } = await getAging().catch(handleReadError);

  const totals = BUCKET_LABELS.map((_, i) => rows.reduce((s, r) => s + r.cells[i], 0));
  const grandTotal = totals.reduce((s, c) => s + c, 0);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Reveal className="space-y-3">
        <Link
          href="/reports"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-caption"
        >
          <ArrowLeft className="size-3" />
          All reports
        </Link>
        <PageHeader
          title="Accounts receivable aging"
          description={
            <>
              {rows.length} accounts holding{" "}
              <span className="tnum text-foreground font-medium">
                {money(grandTotal)}
              </span>{" "}
              of open balance.
            </>
          }
          actions={
            <>
              <Button variant="outline" size="sm">
                <Download className="size-3.5" />
                CSV
              </Button>
              <Button variant="outline" size="sm">
                <Download className="size-3.5" />
                PDF
              </Button>
            </>
          }
        />
      </Reveal>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Reveal delay={0.04}>
          <AgingPanel buckets={buckets} />
        </Reveal>

        <Reveal delay={0.06} className="xl:col-span-2">
          <section
            aria-labelledby="by-customer-heading"
            className="bg-card shadow-e1 overflow-hidden rounded-xl border"
          >
            <h2
              id="by-customer-heading"
              className="border-b px-4 py-3 text-h3 font-semibold tracking-tight"
            >
              Aging by customer
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-small">
                <caption className="sr-only">
                  Open balance for each customer, split by how far past due it is
                </caption>
                <thead>
                  <tr className="bg-muted/40 text-muted-foreground text-caption">
                    <th scope="col" className="px-4 py-2 text-left font-medium">
                      Customer
                    </th>
                    {BUCKET_LABELS.map((label) => (
                      <th
                        key={label}
                        scope="col"
                        className="px-3 py-2 text-right font-medium whitespace-nowrap"
                      >
                        {label}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.customer_id} className="hover:bg-muted/30">
                      <th scope="row" className="px-4 py-2 text-left font-normal">
                        <CustomerCell id={row.customer_id} name={row.customer_name} />
                      </th>
                      {row.cells.map((cell, i) => (
                        <td
                          key={BUCKET_LABELS[i]}
                          data-numeric
                          className={
                            cell === 0
                              ? "text-muted-foreground/50 px-3 py-2 text-right"
                              : i >= 3
                                ? "text-danger px-3 py-2 text-right font-medium"
                                : "px-3 py-2 text-right"
                          }
                        >
                          {cell === 0 ? "—" : money(cell)}
                        </td>
                      ))}
                      <td
                        data-numeric
                        className="px-4 py-2 text-right font-semibold"
                      >
                        {money(row.total_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 border-t">
                  <tr>
                    <th scope="row" className="px-4 py-2.5 text-left font-medium">
                      All accounts
                    </th>
                    {totals.map((t, i) => (
                      <td
                        key={BUCKET_LABELS[i]}
                        data-numeric
                        className="px-3 py-2.5 text-right font-medium"
                      >
                        {money(t)}
                      </td>
                    ))}
                    <td data-numeric className="px-4 py-2.5 text-right font-semibold">
                      {money(grandTotal)}
                    </td>
                  </tr>
                  <tr className="text-muted-foreground text-caption">
                    <th scope="row" className="px-4 pb-2.5 text-left font-normal">
                      Share of open balance
                    </th>
                    {totals.map((t, i) => (
                      <td
                        key={BUCKET_LABELS[i]}
                        data-numeric
                        className="px-3 pb-2.5 text-right"
                      >
                        {percent((t / (grandTotal || 1)) * 100, 0)}
                      </td>
                    ))}
                    <td className="px-4 pb-2.5 text-right">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </Reveal>
      </div>
    </div>
  );
}
