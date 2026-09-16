import type { Invoice, ISODate } from "@/types";

/**
 * What a payment does to an invoice.
 *
 * Pure, and deliberately not a method on anything: the tables and the invoice
 * detail page both apply it to their own local copy today, and it is the same
 * transformation an optimistic update will apply once writes reach the API.
 *
 * Money is integer cents, so every figure here is exact.
 */
export function applyPayment(
  invoice: Invoice,
  amountCents: number,
  receivedOn: ISODate,
): Invoice {
  const paid = Math.min(invoice.amount_cents, invoice.paid_cents + amountCents);
  const balance = invoice.amount_cents - paid;
  const settled = balance === 0;

  return {
    ...invoice,
    paid_cents: paid,
    balance_cents: balance,
    status: settled ? "paid" : "partially_paid",
    // A settled invoice carries no collection risk and is no longer late.
    risk: settled ? "low" : invoice.risk,
    days_overdue: settled ? 0 : invoice.days_overdue,
    paid_date: settled ? receivedOn : invoice.paid_date,
  };
}

/** Settle the whole outstanding balance. */
export function markPaid(invoice: Invoice, on: ISODate): Invoice {
  return applyPayment(invoice, invoice.balance_cents, on);
}

/** Record that someone was chased today. */
export function markReminded(invoice: Invoice, on: ISODate): Invoice {
  return { ...invoice, last_contacted_at: on };
}
