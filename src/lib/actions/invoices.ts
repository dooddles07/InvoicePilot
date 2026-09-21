"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ApiError } from "@/lib/api/client";
import { patchInvoice, postInvoice, sendInvoice as sendInvoiceApi } from "@/lib/api/invoices";
import { postPayment } from "@/lib/api/payments";

/**
 * Actions return a result instead of throwing, the same reasoning as
 * lib/actions/auth.ts: a thrown error in a Server Action replaces the page
 * with the error boundary, which is the wrong response to "that amount is
 * too large" -- the dialog needs to stay open with the message next to the
 * field it came from.
 *
 * revalidatePath, not revalidateTag (D1): apiFetch sets cache: "no-store",
 * so there is no cache entry for a tag to invalidate.
 */
export type ActionResult = { ok: true } | { ok: false; message: string };

function fail(error: unknown, fallback: string): { ok: false; message: string } {
  if (error instanceof ApiError && error.status !== 500) {
    return { ok: false, message: error.detail };
  }
  return { ok: false, message: fallback };
}

/** Every write here touches the same four screens a reviewer would reload
 *  to check it "stuck": the invoice itself, the list, the collections queue
 *  it may enter or leave, and the dashboard figures it feeds. */
function revalidateInvoiceViews(invoiceId: string) {
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/collections");
  revalidatePath("/dashboard");
}

const recordPaymentSchema = z.object({
  invoice_id: z.uuid(),
  amount_cents: z.number().int().positive(),
  method: z.enum(["bank_transfer", "card", "ach", "check", "stripe", "paypal"]),
  reference: z.string().optional(),
  received_at: z.string(),
});

export async function recordPayment(input: unknown): Promise<ActionResult> {
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the payment details and try again." };

  try {
    await postPayment(parsed.data);
  } catch (error) {
    return fail(error, "Could not record the payment. Try again.");
  }
  revalidateInvoiceViews(parsed.data.invoice_id);
  return { ok: true };
}

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unit_price_cents: z.number().int().positive(),
});

const createInvoiceSchema = z.object({
  customer_id: z.uuid(),
  issue_date: z.string(),
  due_date: z.string(),
  po_number: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(lineItemSchema).min(1),
});

export type CreateInvoiceResult =
  | { ok: true; invoiceId: string; number: string }
  | { ok: false; message: string };

export async function createInvoice(input: unknown): Promise<CreateInvoiceResult> {
  const parsed = createInvoiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the invoice details and try again." };

  try {
    const invoice = await postInvoice(parsed.data);
    revalidatePath("/invoices");
    return { ok: true, invoiceId: invoice.id, number: invoice.number };
  } catch (error) {
    return fail(error, "Could not create the invoice. Try again.");
  }
}

export async function markDisputed(invoiceId: string): Promise<ActionResult> {
  try {
    await patchInvoice(invoiceId, { status: "disputed" });
  } catch (error) {
    return fail(error, "Could not mark the invoice as disputed.");
  }
  revalidateInvoiceViews(invoiceId);
  return { ok: true };
}

const sendSchema = z.object({
  tone: z.enum(["friendly", "firm", "final"]).default("friendly"),
  idempotency_key: z.string().min(1),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
});

/** Backs both "send this draft" and "send a reminder" -- the backend
 *  endpoint is the same call either way; only the tone and copy differ. */
export async function sendInvoice(invoiceId: string, input: unknown): Promise<ActionResult> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose a tone and try again." };

  try {
    await sendInvoiceApi(invoiceId, parsed.data);
  } catch (error) {
    return fail(error, "Could not send the email. Try again.");
  }
  revalidateInvoiceViews(invoiceId);
  return { ok: true };
}
