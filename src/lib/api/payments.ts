import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { Payment, PaymentMethod } from "@/types";
import { apiFetch } from "./client";
import { listOf, toQueryString } from "./list";

const paymentMethodSchema = z.enum([
  "bank_transfer",
  "card",
  "ach",
  "check",
  "stripe",
  "paypal",
]) satisfies z.ZodType<PaymentMethod>;

// Field for field with backend/src/models/payments.js's SELECT list.
const paymentSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  invoice_id: z.uuid(),
  invoice_number: z.string(),
  customer_id: z.uuid(),
  customer_name: z.string(),
  amount_cents: z.number().int(),
  method: paymentMethodSchema,
  reference: z.string().nullable(),
  received_at: z.string(),
}) satisfies z.ZodType<Payment>;

const paymentListSchema = listOf(paymentSchema);

export type PaymentListQuery = {
  limit?: number;
  offset?: number;
  sort?: "received_at" | "amount_cents";
  order?: "asc" | "desc";
};

export const getPayments = cache(async (query: PaymentListQuery = {}) =>
  apiFetch(`/payments${toQueryString(query)}`, { schema: paymentListSchema }));
