"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useOptimistic, useTransition } from "react";
import type { ReactNode } from "react";

import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { InvoiceStatusBadge } from "@/components/invoicepilot/status-badge";
import type { RecordPaymentValues } from "@/components/invoicepilot/record-payment-dialog";
import type { SendReminderValues } from "@/components/invoicepilot/send-reminder-dialog";
import { Timeline } from "@/components/invoicepilot/timeline";
import { markDisputed, recordPayment, sendInvoice } from "@/lib/actions/invoices";
import { applyPayment, markReminded } from "@/lib/data/mutate";
import { formatDate, money } from "@/lib/format";
import type { CollectionEvent, Invoice } from "@/types";

type ActionOutcome = { ok: boolean; message?: string };

type LiveState = {
  invoice: Invoice;
  events: CollectionEvent[];
  pending: boolean;
  record: (values: RecordPaymentValues) => Promise<ActionOutcome>;
  remind: (values: SendReminderValues) => Promise<ActionOutcome>;
  dispute: () => Promise<ActionOutcome>;
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Both derive from the server-fetched props, which is why neither is a
  // plain useState: router.refresh() re-renders this provider's parent with
  // fresh data, and useOptimistic snaps back to that real value on its own
  // once the transition settles -- correct whether the action succeeded (the
  // guess matched, or is quietly corrected) or failed (the guess reverts,
  // since the real props never moved). revalidatePath alone marks the route
  // stale but does not itself repaint a page the user never navigated away
  // from; router.refresh() is what asks for the repaint.
  const [optimisticInvoice, applyOptimisticInvoice] = useOptimistic(invoice);
  const [optimisticEvents, applyOptimisticEvent] = useOptimistic(
    events,
    (state, entry: CollectionEvent) => [entry, ...state],
  );

  const value: LiveState = {
    invoice: optimisticInvoice,
    events: optimisticEvents,
    pending: isPending,

    record: (values) =>
      new Promise<ActionOutcome>((resolve) => {
        startTransition(async () => {
          applyOptimisticInvoice(
            applyPayment(optimisticInvoice, values.amountCents, values.receivedOn),
          );
          applyOptimisticEvent({
            id: `optimistic-payment-${values.receivedOn}`,
            workspace_id: optimisticInvoice.workspace_id,
            invoice_id: optimisticInvoice.id,
            customer_id: optimisticInvoice.customer_id,
            type: "payment_received",
            channel: "system",
            summary: `Payment of ${money(values.amountCents)} recorded`,
            detail: null,
            actor: "You",
            occurred_at: values.receivedOn,
          });
          const result = await recordPayment({
            invoice_id: optimisticInvoice.id,
            amount_cents: values.amountCents,
            method: values.method,
            reference: values.reference,
            received_at: values.receivedOn,
          });
          if (result.ok) router.refresh();
          resolve(result.ok ? { ok: true } : { ok: false, message: result.message });
        });
      }),

    remind: (values) =>
      new Promise<ActionOutcome>((resolve) => {
        startTransition(async () => {
          applyOptimisticInvoice(markReminded(optimisticInvoice, today));
          applyOptimisticEvent({
            id: `optimistic-reminder-${values.idempotencyKey}`,
            workspace_id: optimisticInvoice.workspace_id,
            invoice_id: optimisticInvoice.id,
            customer_id: optimisticInvoice.customer_id,
            type: "reminder_sent",
            channel: "email",
            summary: `Reminder sent to ${optimisticInvoice.customer_name}`,
            detail: null,
            actor: "You",
            occurred_at: today,
          });
          const result = await sendInvoice(optimisticInvoice.id, {
            tone: values.tone,
            body: values.body,
            idempotency_key: values.idempotencyKey,
          });
          if (result.ok) router.refresh();
          resolve(result.ok ? { ok: true } : { ok: false, message: result.message });
        });
      }),

    dispute: () =>
      new Promise<ActionOutcome>((resolve) => {
        startTransition(async () => {
          applyOptimisticInvoice({ ...optimisticInvoice, status: "disputed" });
          const result = await markDisputed(optimisticInvoice.id);
          if (result.ok) router.refresh();
          resolve(result.ok ? { ok: true } : { ok: false, message: result.message });
        });
      }),
  };

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
  const { invoice, record, remind, dispute } = useLive();

  return (
    <InvoiceActions
      invoice={invoice}
      contactName={contactName}
      today={today}
      onRecorded={record}
      onSent={remind}
      onDisputed={dispute}
    />
  );
}

export function InvoiceLiveTimeline({ emptyLabel }: { emptyLabel?: string }) {
  return <Timeline events={useLive().events} emptyLabel={emptyLabel} />;
}
