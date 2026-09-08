import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Mail,
  Phone,
  Sparkles,
  StickyNote,
} from "lucide-react";

import { PaymentBehaviourChart } from "@/components/customers/payment-behaviour-chart";
import { EmptyState } from "@/components/invoicepilot/empty-state";
import { LinkButton } from "@/components/invoicepilot/link-button";
import {
  InvoiceStatusBadge,
  RiskBadge,
} from "@/components/invoicepilot/status-badge";
import { Timeline } from "@/components/invoicepilot/timeline";
import { Reveal } from "@/components/motion/reveal";
import {
  customers,
  getCustomer,
  getCustomerEvents,
  getCustomerInvoices,
  getPaymentBehaviour,
  NOW,
  OPEN_STATUSES,
} from "@/lib/data";
import { dueLabel, formatDate, money, percent } from "@/lib/format";
import { cn } from "@/lib/utils";

export async function generateStaticParams() {
  return customers.map((c) => ({ id: c.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: getCustomer(id)?.name ?? "Customer" };
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = getCustomer(id);
  if (!customer) notFound();

  const all = getCustomerInvoices(customer.id);
  const open = all.filter((i) => OPEN_STATUSES.includes(i.status));
  const behaviour = getPaymentBehaviour(customer.id);
  const events = getCustomerEvents(customer.id);

  const stats = [
    { label: "Outstanding", value: money(customer.outstanding_cents) },
    { label: "Total invoiced", value: money(customer.total_invoiced_cents) },
    { label: "Average payment time", value: `${customer.avg_days_to_pay} days` },
    { label: "On-time rate", value: percent(customer.on_time_rate, 0) },
  ];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Reveal className="space-y-3">
        <Link
          href="/customers"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-caption"
        >
          <ArrowLeft className="size-3" />
          All customers
        </Link>

        <div className="bg-card shadow-e1 rounded-xl border">
          <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <h1 className="text-h1 leading-none font-semibold tracking-tight">
                {customer.name}
              </h1>
              <p className="text-muted-foreground text-caption">
                {customer.industry} · customer since{" "}
                {new Date(customer.customer_since).getUTCFullYear()} ·{" "}
                {customer.payment_terms_days}-day terms
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <RiskBadge risk={customer.risk} />
                <span className="text-muted-foreground flex items-center gap-1.5 text-caption">
                  <Mail className="size-3.5" aria-hidden />
                  {customer.email}
                </span>
                {customer.phone ? (
                  <span className="text-muted-foreground flex items-center gap-1.5 text-caption">
                    <Phone className="size-3.5" aria-hidden />
                    {customer.phone}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 gap-2">
              <LinkButton size="sm" variant="outline" href="/collections">
                View in collections
              </LinkButton>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-px border-t sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="px-4 py-3">
                <dt className="text-muted-foreground text-caption">{s.label}</dt>
                <dd className="figure text-h3 font-semibold">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          <Reveal delay={0.04}>
            <section
              aria-labelledby="behaviour-heading"
              className="bg-card shadow-e1 rounded-xl border"
            >
              <div className="border-b px-4 py-3">
                <h2
                  id="behaviour-heading"
                  className="text-h3 font-semibold tracking-tight"
                >
                  Payment behaviour
                </h2>
                <p className="text-muted-foreground text-caption">
                  Days beyond terms on each settled invoice, by month. Below the
                  line is early.
                </p>
              </div>
              <div className="p-4">
                <PaymentBehaviourChart data={behaviour} />
              </div>
            </section>
          </Reveal>

          <Reveal delay={0.08}>
            <section
              aria-labelledby="open-invoices-heading"
              className="bg-card shadow-e1 overflow-hidden rounded-xl border"
            >
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <h2
                  id="open-invoices-heading"
                  className="text-h3 font-semibold tracking-tight"
                >
                  Outstanding invoices
                </h2>
                <span className="tnum text-muted-foreground text-caption">
                  {open.length} open · {money(customer.outstanding_cents)}
                </span>
              </div>

              {open.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={CheckCircle2}
                    tone="positive"
                    title="Nothing outstanding"
                    description={`${customer.name} has settled every invoice you have issued.`}
                  />
                </div>
              ) : (
                <ul className="divide-y">
                  {open.map((inv) => {
                    const late = inv.days_overdue > 0;
                    return (
                      <li
                        key={inv.id}
                        className="hover:bg-muted/30 flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors"
                      >
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="font-mono text-caption font-medium hover:underline"
                        >
                          {inv.number}
                        </Link>
                        <InvoiceStatusBadge status={inv.status} />
                        <span
                          className={cn(
                            "text-caption",
                            late ? "text-danger" : "text-muted-foreground",
                          )}
                        >
                          {dueLabel(inv.due_date, NOW)}
                        </span>
                        <span className="figure ml-auto text-small font-semibold">
                          {money(inv.balance_cents)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </Reveal>

          <Reveal delay={0.1}>
            <section
              aria-labelledby="history-heading"
              className="bg-card shadow-e1 rounded-xl border"
            >
              <h2
                id="history-heading"
                className="border-b px-4 py-3 text-h3 font-semibold tracking-tight"
              >
                Communication history
              </h2>
              <div className="p-4">
                <Timeline
                  events={events}
                  emptyLabel={`Nothing has been sent to ${customer.name} yet.`}
                />
              </div>
            </section>
          </Reveal>
        </div>

        <div className="space-y-3">
          <Reveal delay={0.06}>
            <section
              aria-labelledby="risk-heading"
              className="border-brand/25 from-brand-muted/70 shadow-e1 rounded-xl border bg-gradient-to-b to-transparent p-4"
            >
              <h2
                id="risk-heading"
                className="flex items-center gap-2 text-h3 font-semibold tracking-tight"
              >
                <Sparkles className="text-brand size-4" aria-hidden />
                Risk score
              </h2>
              <div className="mt-2 flex items-center gap-2">
                <RiskBadge risk={customer.risk} />
                <span className="text-muted-foreground text-caption">
                  {percent(customer.on_time_rate, 0)} on time across{" "}
                  {all.length} invoices
                </span>
              </div>
              <p className="mt-2 text-small">{customer.risk_reason}</p>
            </section>
          </Reveal>

          <Reveal delay={0.1}>
            <section
              aria-labelledby="details-heading"
              className="bg-card shadow-e1 rounded-xl border"
            >
              <h2
                id="details-heading"
                className="border-b px-4 py-3 text-h3 font-semibold tracking-tight"
              >
                Account details
              </h2>
              <dl className="grid grid-cols-2 gap-3 p-4">
                <Detail label="Primary contact" value={customer.contact_name} />
                <Detail
                  label="Payment terms"
                  value={`${customer.payment_terms_days} days`}
                />
                <Detail
                  label="Customer since"
                  value={formatDate(customer.customer_since)}
                />
                <Detail label="Invoices issued" value={String(all.length)} />
              </dl>
            </section>
          </Reveal>

          <Reveal delay={0.12}>
            <section
              aria-labelledby="notes-heading"
              className="bg-card shadow-e1 rounded-xl border"
            >
              <h2
                id="notes-heading"
                className="border-b px-4 py-3 text-h3 font-semibold tracking-tight"
              >
                Notes
              </h2>
              <div className="p-4">
                <EmptyState
                  icon={StickyNote}
                  title="No notes yet"
                  description="Record context your team should see before the next call — a promised payment date, a disputed line, a change of contact."
                />
              </div>
            </section>
          </Reveal>

          <Reveal delay={0.14}>
            <p className="text-muted-foreground flex items-start gap-2 text-caption">
              <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Statistics are recalculated from the ledger whenever an invoice or
              payment changes.
            </p>
          </Reveal>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-caption">{label}</dt>
      <dd className="truncate text-small font-medium">{value}</dd>
    </div>
  );
}
