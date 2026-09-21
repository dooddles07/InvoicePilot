import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Building2, Mail, Phone, Sparkles } from "lucide-react";

import {
  InvoiceLiveActions,
  InvoiceLiveFigure,
  InvoiceLiveProvider,
  InvoiceLiveStatus,
  InvoiceLiveTimeline,
} from "@/components/invoices/invoice-live";
import { RiskBadge } from "@/components/invoicepilot/status-badge";
import { Timeline } from "@/components/invoicepilot/timeline";
import { Reveal } from "@/components/motion/reveal";
import { Separator } from "@/components/ui/separator";
import { handleReadError } from "@/lib/api/client";
import { getInvoice, getInvoiceEvents } from "@/lib/api/invoices";
import { dueLabel, formatDate, money } from "@/lib/format";
import type { InvoiceDetail } from "@/types";
import { cn } from "@/lib/utils";

// Per-tenant data cannot prerender: every workspace has its own invoice ids.
export async function generateMetadata({
  params,
}: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const invoice = await getInvoice(id).catch(handleReadError);
  return { title: invoice.number };
}

export default async function InvoiceDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getInvoice(id).catch(handleReadError);
  const { data: events } = await getInvoiceEvents(id).catch(handleReadError);

  const comms = events.filter((e) =>
    ["reminder_sent", "escalation_sent", "call_logged", "dispute_raised"].includes(
      e.type,
    ),
  );
  const late = invoice.is_overdue ?? false;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const recommendation = buildRecommendation(
    invoice,
    invoice.customer.avg_days_to_pay,
    invoice.customer.contact_name,
  );

  return (
    <InvoiceLiveProvider invoice={invoice} events={events} today={today}>
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Reveal className="space-y-3">
        <Link
          href="/invoices"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-caption"
        >
          <ArrowLeft className="size-3" />
          All invoices
        </Link>

        <div className="bg-card shadow-e1 rounded-xl border">
          <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <p className="text-muted-foreground font-mono text-caption">
                {invoice.number}
              </p>
              <h1 className="text-h1 leading-none font-semibold tracking-tight">
                <Link
                  href={`/customers/${invoice.customer.id}`}
                  className="hover:underline"
                >
                  {invoice.customer_name}
                </Link>
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <InvoiceLiveStatus />
                {invoice.status !== "paid" ? (
                  <RiskBadge risk={invoice.risk} />
                ) : null}
                <span
                  className={cn(
                    "text-caption",
                    late ? "text-danger font-medium" : "text-muted-foreground",
                  )}
                >
                  {invoice.status === "paid"
                    ? `Settled ${formatDate(invoice.paid_date!)}`
                    : dueLabel(invoice.due_date, now)}
                </span>
              </div>
            </div>

            <InvoiceLiveFigure />
          </div>

          <Separator />

          <div className="p-3">
            <InvoiceLiveActions
              contactName={invoice.customer.contact_name}
              today={today}
            />
          </div>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          <Reveal delay={0.04}>
            <section
              aria-labelledby="summary-heading"
              className="bg-card shadow-e1 overflow-hidden rounded-xl border"
            >
              <h2
                id="summary-heading"
                className="border-b px-4 py-3 text-h3 font-semibold tracking-tight"
              >
                Invoice summary
              </h2>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-4">
                <Field label="Issued" value={formatDate(invoice.issue_date)} />
                <Field label="Due" value={formatDate(invoice.due_date)} />
                <Field
                  label="Terms"
                  value={`${invoice.customer.payment_terms_days} days`}
                />
                <Field label="PO number" value={invoice.po_number ?? "—"} />
              </dl>

              <div className="overflow-x-auto border-t">
                <table className="w-full text-small">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground text-caption">
                      <th className="px-4 py-2 text-left font-medium">
                        Description
                      </th>
                      <th className="px-4 py-2 text-right font-medium">Qty</th>
                      <th className="px-4 py-2 text-right font-medium">
                        Unit price
                      </th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {invoice.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-2">{item.description}</td>
                        <td className="tnum px-4 py-2 text-right">
                          {item.quantity}
                        </td>
                        <td className="tnum px-4 py-2 text-right">
                          {money(item.unit_price_cents)}
                        </td>
                        <td className="tnum px-4 py-2 text-right font-medium">
                          {money(item.amount_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right">
                        Invoice total
                      </td>
                      <td className="tnum px-4 py-2 text-right font-semibold">
                        {money(invoice.amount_cents)}
                      </td>
                    </tr>
                    {invoice.paid_cents > 0 ? (
                      <tr className="text-success">
                        <td colSpan={3} className="px-4 py-2 text-right">
                          Received
                        </td>
                        <td className="tnum px-4 py-2 text-right font-medium">
                          −{money(invoice.paid_cents)}
                        </td>
                      </tr>
                    ) : null}
                    <tr className="bg-muted/30">
                      <td colSpan={3} className="px-4 py-2.5 text-right font-medium">
                        Balance due
                      </td>
                      <td className="figure px-4 py-2.5 text-right font-semibold">
                        {money(invoice.balance_cents)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          </Reveal>

          <Reveal delay={0.08}>
            <section
              aria-labelledby="activity-heading"
              className="bg-card shadow-e1 rounded-xl border"
            >
              <h2
                id="activity-heading"
                className="border-b px-4 py-3 text-h3 font-semibold tracking-tight"
              >
                Activity log
              </h2>
              <div className="p-4">
                <InvoiceLiveTimeline />
              </div>
            </section>
          </Reveal>
        </div>

        <div className="space-y-3">
          <Reveal delay={0.06}>
            <section
              aria-labelledby="ai-recommendation-heading"
              className="border-brand/25 from-brand-muted/70 shadow-e1 rounded-xl border bg-gradient-to-b to-transparent p-4"
            >
              <h2
                id="ai-recommendation-heading"
                className="flex items-center gap-2 text-h3 font-semibold tracking-tight"
              >
                <Sparkles className="text-brand size-4" aria-hidden />
                AI recommendation
              </h2>
              <p className="mt-2 text-small">{recommendation}</p>
              <p className="text-muted-foreground mt-2 text-caption">
                Based on {invoice.customer.name}&rsquo;s payment history across{" "}
                {invoice.customer.open_invoice_count > 0
                  ? `${invoice.customer.open_invoice_count} open invoices`
                  : "their settled invoices"}
                . Nothing is sent without your confirmation.
              </p>
            </section>
          </Reveal>

          <Reveal delay={0.1}>
            <section
              aria-labelledby="customer-heading"
              className="bg-card shadow-e1 rounded-xl border"
            >
              <h2
                id="customer-heading"
                className="border-b px-4 py-3 text-h3 font-semibold tracking-tight"
              >
                Customer
              </h2>
              <div className="space-y-3 p-4">
                <Link
                  href={`/customers/${invoice.customer.id}`}
                  className="flex items-center gap-2 text-small font-medium hover:underline"
                >
                  <Building2 className="text-muted-foreground size-4" aria-hidden />
                  {invoice.customer.name}
                </Link>
                <p className="text-muted-foreground flex items-center gap-2 text-caption">
                  <Mail className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{invoice.customer.email}</span>
                </p>
                {invoice.customer.phone ? (
                  <p className="text-muted-foreground flex items-center gap-2 text-caption">
                    <Phone className="size-3.5 shrink-0" aria-hidden />
                    {invoice.customer.phone}
                  </p>
                ) : null}

                <Separator />

                <dl className="grid grid-cols-2 gap-3">
                  <Field
                    label="Outstanding"
                    value={money(invoice.customer.outstanding_cents)}
                  />
                  <Field
                    label="On-time rate"
                    value={`${invoice.customer.on_time_rate}%`}
                  />
                  <Field
                    label="Avg days to pay"
                    value={String(invoice.customer.avg_days_to_pay)}
                  />
                  <Field
                    label="Risk"
                    value={<RiskBadge risk={invoice.customer.risk} />}
                  />
                </dl>
              </div>
            </section>
          </Reveal>

          <Reveal delay={0.12}>
            <section
              aria-labelledby="comms-heading"
              className="bg-card shadow-e1 rounded-xl border"
            >
              <h2
                id="comms-heading"
                className="border-b px-4 py-3 text-h3 font-semibold tracking-tight"
              >
                Communication history
              </h2>
              <div className="p-4">
                <Timeline
                  events={comms}
                  emptyLabel="No reminders or calls have gone out on this invoice."
                />
              </div>
            </section>
          </Reveal>
        </div>
      </div>
    </div>
    </InvoiceLiveProvider>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-caption">{label}</dt>
      <dd className="tnum truncate text-small font-medium">{value}</dd>
    </div>
  );
}

function buildRecommendation(
  invoice: InvoiceDetail,
  avgDaysToPay: number,
  contactName: string,
): string {
  if (invoice.status === "paid") {
    return "Settled — no action needed. This customer's payment pattern is included in their risk score.";
  }
  if (invoice.status === "disputed") {
    return "A dispute is open. Resolve the query before any further reminder: chasing a disputed balance costs goodwill and rarely moves the money.";
  }
  if (invoice.days_overdue <= 0) {
    return `Not yet due. This customer typically pays around day ${avgDaysToPay}, so a courtesy reminder three days before the due date is usually enough to keep it on schedule.`;
  }
  if (invoice.days_overdue > 45) {
    return `At ${invoice.days_overdue} days, email alone rarely recovers this balance. Call ${contactName} directly and aim to agree a payment date or a plan — a specific commitment beats another reminder.`;
  }
  if (invoice.days_overdue > 10) {
    return `This customer typically pays 3–7 days after a second reminder. Send a firmer follow-up today, and escalate if there is no reply within a week.`;
  }
  return "Recently overdue and still well inside the recoverable window. A friendly reminder naming the invoice number usually clears it without any escalation.";
}
