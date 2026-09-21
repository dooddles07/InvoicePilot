"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { InvoiceStatusBadge } from "@/components/invoicepilot/status-badge";
import { Timeline } from "@/components/invoicepilot/timeline";
import { applyPayment, markReminded } from "@/lib/data/mutate";
import { formatDate, money } from "@/lib/format";
import type { CollectionEvent, Invoice } from "@/types";

type LiveState = {
  invoice: Invoice;
  events: CollectionEvent[];
  record: (amountCents: number, receivedOn: string) => void;
  remind: () => void;
};

const InvoiceLiveContext = createContext<LiveState | null>(null);

function useLive(): LiveState {
  const value = useContext(InvoiceLiveContext);
  if (!value) {
    throw new Error("Invoice live components must sit inside InvoiceLiveProvider.");
  }
  return value;
}

/** Exported for the header card, which needs the customer name for its copy. */
export function useInvoiceLive(): Invoice {
  return useLive().invoice;
}

export function InvoiceLiveProvider({
  invoice,
  events,
  today,
  children,
}: {
  invoice: Invoice;
  events: CollectionEvent[];
  today: string;
  children: ReactNode;
}) {
  const [current, setCurrent] = useState(invoice);
  const [log, setLog] = useState(events);

  const value = useMemo<LiveState>(
    () => ({
      invoice: current,
      events: log,
      record: (amountCents, receivedOn) => {
        setCurrent((inv) => applyPayment(inv, amountCents, receivedOn));
        setLog((entries) => [
          {
            id: `local-payment-${entries.length}`,
            workspace_id: current.workspace_id,
            invoice_id: current.id,
            customer_id: current.customer_id,
            type: "payment_received",
            channel: "system",
            summary: `Payment of ${money(amountCents)} recorded`,
            detail: `Received ${formatDate(receivedOn)}.`,
            actor: "You",
            occurred_at: receivedOn,
          },
          ...entries,
        ]);
      },
      remind: () => {
        setCurrent((inv) => markReminded(inv, today));
        setLog((entries) => [
          {
            id: `local-reminder-${entries.length}`,
            workspace_id: current.workspace_id,
            invoice_id: current.id,
            customer_id: current.customer_id,
            type: "reminder_sent",
            channel: "email",
            summary: `Reminder sent to ${current.customer_name}`,
            detail: null,
            actor: "You",
            occurred_at: today,
          },
          ...entries,
        ]);
      },
    }),
    [current, log, today],
  );

  return (
    <InvoiceLiveContext.Provider value={value}>
      {children}
    </InvoiceLiveContext.Provider>
  );
}

/** The headline amount and the line underneath it. */
export function InvoiceLiveFigure() {
  const invoice = useLive().invoice;

  return (
    <div className="shrink-0 lg:text-right">
      <p className="figure text-h1 leading-none font-semibold">
        {money(
          invoice.status === "paid" ? invoice.amount_cents : invoice.balance_cents,
        )}
      </p>
      <p className="text-muted-foreground mt-1 text-caption">
        {invoice.status === "paid"
          ? "paid in full"
          : invoice.paid_cents > 0
            ? `${money(invoice.paid_cents)} of ${money(invoice.amount_cents)} received`
            : `due ${formatDate(invoice.due_date)}`}
      </p>
    </div>
  );
}

export function InvoiceLiveStatus() {
  const invoice = useLive().invoice;
  return <InvoiceStatusBadge status={invoice.status} isOverdue={invoice.is_overdue} />;
}

export function InvoiceLiveActions({ contactName, today }: {
  contactName: string;
  today: string;
}) {
  const { invoice, record, remind } = useLive();

  return (
    <InvoiceActions
      invoice={invoice}
      contactName={contactName}
      today={today}
      onRecorded={record}
      onSent={remind}
    />
  );
}

export function InvoiceLiveTimeline({ emptyLabel }: { emptyLabel?: string }) {
  return <Timeline events={useLive().events} emptyLabel={emptyLabel} />;
}
