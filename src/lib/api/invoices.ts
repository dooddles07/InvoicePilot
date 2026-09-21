import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { CollectionEvent, Invoice, InvoiceDetail, InvoiceStatus, RiskLevel } from "@/types";
import { apiFetch } from "./client";
import { listOf, toQueryString } from "./list";

export const invoiceStatusSchema = z.enum([
  "draft",
  "sent",
  "viewed",
  "partially_paid",
  "paid",
  "disputed",
]) satisfies z.ZodType<Exclude<InvoiceStatus, "overdue">>;

export const riskSchema = z.enum(["low", "medium", "high"]) satisfies z.ZodType<RiskLevel>;

// Field for field with backend/src/models/invoices.js's SELECT list, so a
// backend rename becomes a type error here rather than a blank column.
// Exported so collections.ts's pipeline schema can extend it with `stage`
// rather than duplicating every field.
export const invoiceSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  number: z.string(),
  customer_id: z.uuid(),
  customer_name: z.string(),
  status: invoiceStatusSchema,
  risk: riskSchema,
  amount_cents: z.number().int(),
  paid_cents: z.number().int(),
  balance_cents: z.number().int(),
  issue_date: z.string(),
  due_date: z.string(),
  paid_date: z.string().nullable(),
  days_overdue: z.number().int(),
  is_overdue: z.boolean(),
  last_contacted_at: z.string().nullable(),
  next_action: z.string().nullable(),
  po_number: z.string().nullable(),
  notes: z.string().nullable(),
}) satisfies z.ZodType<Invoice>;

const invoiceItemSchema = z.object({
  id: z.uuid(),
  description: z.string(),
  quantity: z.number().int(),
  unit_price_cents: z.number().int(),
  amount_cents: z.number().int(),
});

const invoiceDetailSchema = invoiceSchema.extend({
  items: z.array(invoiceItemSchema),
  customer: z.object({
    id: z.uuid(),
    name: z.string(),
    contact_name: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    payment_terms_days: z.number().int(),
    outstanding_cents: z.number().int(),
    on_time_rate: z.number().int(),
    avg_days_to_pay: z.number().int(),
    open_invoice_count: z.number().int(),
    risk: riskSchema,
  }),
}) satisfies z.ZodType<InvoiceDetail>;

const invoiceListSchema = listOf(invoiceSchema);

// Server-fetched and locally-appended events (InvoiceLiveProvider's optimistic
// record/remind) share one array, so this must be the full CollectionEvent
// shape, not the trimmed subset the events endpoint alone would need.
const collectionEventSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  invoice_id: z.uuid().nullable(),
  customer_id: z.uuid(),
  type: z.enum([
    "invoice_sent",
    "invoice_viewed",
    "reminder_sent",
    "escalation_sent",
    "call_logged",
    "note_added",
    "payment_received",
    "dispute_raised",
    "automation_ran",
  ]),
  channel: z.enum(["email", "sms", "phone", "system"]).nullable(),
  summary: z.string(),
  detail: z.string().nullable(),
  actor: z.string(),
  occurred_at: z.string(),
}) satisfies z.ZodType<CollectionEvent>;

export type InvoiceListQuery = {
  limit?: number;
  offset?: number;
  sort?: "due_date" | "issue_date" | "balance_cents" | "amount_cents" | "number";
  order?: "asc" | "desc";
  status?: InvoiceStatus;
  risk?: RiskLevel;
  customer_id?: string;
  overdue?: boolean;
  search?: string;
};

export const getInvoices = cache(async (query: InvoiceListQuery = {}) =>
  apiFetch(`/invoices${toQueryString(query)}`, { schema: invoiceListSchema }));

export const getInvoice = cache(async (invoiceId: string) =>
  apiFetch(`/invoices/${invoiceId}`, { schema: invoiceDetailSchema }));

// Not listOf(): this sub-resource is the complete, unfiltered event history
// for one invoice, with no limit/offset/sort -- total has no meaning here.
const invoiceEventsSchema = z.object({ data: z.array(collectionEventSchema) });

export const getInvoiceEvents = cache(async (invoiceId: string) =>
  apiFetch(`/invoices/${invoiceId}/events`, { schema: invoiceEventsSchema }));

/* ---------- writes ----------
 * Not cache()-wrapped: React's cache() dedupes identical calls within one
 * render, which is wrong for anything with a side effect. Called from
 * src/lib/actions/invoices.ts, never from a page directly.
 */

export type CreateInvoiceInput = {
  customer_id: string;
  issue_date: string;
  due_date: string;
  po_number?: string;
  notes?: string;
  items: { description: string; quantity: number; unit_price_cents: number }[];
};

export const postInvoice = (body: CreateInvoiceInput) =>
  apiFetch("/invoices", { method: "POST", body, schema: invoiceDetailSchema });

export type UpdateInvoiceInput = {
  status?: "sent" | "disputed";
  po_number?: string | null;
  notes?: string | null;
  due_date?: string;
};

export const patchInvoice = (invoiceId: string, body: UpdateInvoiceInput) =>
  apiFetch(`/invoices/${invoiceId}`, { method: "PATCH", body, schema: invoiceSchema });

export type SendInvoiceInput = {
  tone?: "friendly" | "firm" | "final";
  idempotency_key: string;
  subject?: string;
  body?: string;
};

export const sendInvoice = (invoiceId: string, body: SendInvoiceInput) =>
  apiFetch(`/invoices/${invoiceId}/send`, { method: "POST", body, schema: invoiceSchema });
