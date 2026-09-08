import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

import { AgingPanel } from "@/components/dashboard/aging-panel";
import { CustomerCell } from "@/components/invoicepilot/customer-cell";
import { PageHeader } from "@/components/invoicepilot/page-header";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { customers, getAging, openInvoices } from "@/lib/data";
import { money, percent } from "@/lib/format";
import type { AgingBucketKey } from "@/types";

export const metadata: Metadata = { title: "Accounts receivable aging" };

const BUCKETS: { key: AgingBucketKey; label: string; test: (d: number) => boolean }[] =
  [
    { key: "current", label: "Current", test: (d) => d <= 0 },
    { key: "1_30", label: "1–30", test: (d) => d >= 1 && d <= 30 },
    { key: "31_60", label: "31–60", test: (d) => d >= 31 && d <= 60 },
    { key: "61_90", label: "61–90", test: (d) => d >= 61 && d <= 90 },
    { key: "90_plus", label: "90+", test: (d) => d > 90 },
  ];

export default function AgingReportPage() {
  const buckets = getAging();

  // Per-customer aging: the same partition, sliced by account, which is how a
  // finance manager actually works the report.
  const rows = customers
    .map((customer) => {
      const mine = openInvoices.filter((i) => i.customer_id === customer.id);
      const cells = BUCKETS.map((b) =>
        mine.filter((i) => b.test(i.days_overdue)).reduce((s, i) => s + i.balance_cents, 0),
      );
      return {
        customer,
        cells,
        total: cells.reduce((s, c) => s + c, 0),
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  const totals = BUCKETS.map((_, i) =>
    rows.reduce((s, r) => s + (r.cells[i] ?? 0), 0),
  );
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
                    {BUCKETS.map((b) => (
                      <th
                        key={b.key}
                        scope="col"
                        className="px-3 py-2 text-right font-medium whitespace-nowrap"
                      >
                        {b.label}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.customer.id} className="hover:bg-muted/30">
                      <th scope="row" className="px-4 py-2 text-left font-normal">
                        <CustomerCell
                          id={row.customer.id}
                          name={row.customer.name}
                        />
                      </th>
                      {row.cells.map((cell, i) => (
                        <td
                          key={BUCKETS[i]!.key}
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
                        {money(row.total)}
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
                        key={BUCKETS[i]!.key}
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
                        key={BUCKETS[i]!.key}
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
