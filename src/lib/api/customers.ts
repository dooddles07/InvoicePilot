import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { Customer, RiskLevel } from "@/types";
import { apiFetch } from "./client";
import { listOf, toQueryString } from "./list";

const riskSchema = z.enum(["low", "medium", "high"]) satisfies z.ZodType<RiskLevel>;

// Field for field with backend/src/models/customers.js's SELECT list, so a
// backend rename becomes a type error here rather than a blank column.
const customerSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  name: z.string(),
  contact_name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  industry: z.string().nullable(),
  customer_since: z.string().nullable(),
  payment_terms_days: z.number().int(),
  outstanding_cents: z.number().int(),
  overdue_cents: z.number().int(),
  total_invoiced_cents: z.number().int(),
  avg_days_to_pay: z.number().int(),
  on_time_rate: z.number().int(),
  risk: riskSchema,
  risk_reason: z.string(),
  open_invoice_count: z.number().int(),
}) satisfies z.ZodType<Customer>;

const customerListSchema = listOf(customerSchema);

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
});

// Not listOf(): a customer's event history and behaviour trend are both
// complete, unfiltered sub-resources with no limit/offset/sort -- total has
// no meaning for either.
const customerEventsSchema = z.object({ data: z.array(collectionEventSchema) });

const behaviourPointSchema = z.object({
  month: z.string(),
  days_beyond_terms: z.number().int(),
});
const behaviourSchema = z.object({ data: z.array(behaviourPointSchema) });

export type CustomerListQuery = {
  limit?: number;
  offset?: number;
  sort?: "name" | "outstanding_cents" | "avg_days_to_pay" | "on_time_rate";
  order?: "asc" | "desc";
  risk?: RiskLevel;
  search?: string;
};

export const getCustomers = cache(async (query: CustomerListQuery = {}) =>
  apiFetch(`/customers${toQueryString(query)}`, { schema: customerListSchema }));

export const getCustomer = cache(async (customerId: string) =>
  apiFetch(`/customers/${customerId}`, { schema: customerSchema }));

export const getCustomerEvents = cache(async (customerId: string) =>
  apiFetch(`/customers/${customerId}/events`, { schema: customerEventsSchema }));

/** Formats each point's month into the short label the chart renders --
 *  kept out of the API, which returns a plain date string like every other
 *  timestamp field, not a locale-formatted one. */
export const getPaymentBehaviour = cache(async (customerId: string) => {
  const { data } = await apiFetch(`/customers/${customerId}/behaviour`, {
    schema: behaviourSchema,
  });
  return data.map((point) => ({
    label: new Date(point.month).toLocaleDateString("en-US", {
      month: "short",
      timeZone: "UTC",
    }),
    days_beyond_terms: point.days_beyond_terms,
  }));
});
