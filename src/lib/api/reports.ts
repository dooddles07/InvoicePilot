import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { AgingBucket, AgingBucketKey, CashFlowPoint, KpiSummary } from "@/types";
import { apiFetch } from "./client";

const agingBucketKeySchema = z.enum([
  "current",
  "1_30",
  "31_60",
  "61_90",
  "90_plus",
]) satisfies z.ZodType<AgingBucketKey>;

const kpiSummarySchema = z.object({
  outstanding_cents: z.number().int(),
  overdue_cents: z.number().int(),
  collected_30d_cents: z.number().int(),
  collection_rate: z.number(),
  outstanding_change: z.number(),
  overdue_change: z.number(),
  collected_change: z.number(),
  collection_rate_change: z.number(),
  outstanding_trend: z.array(z.number()),
  overdue_trend: z.array(z.number()),
  collected_trend: z.array(z.number()),
  collection_rate_trend: z.array(z.number()),
}) satisfies z.ZodType<KpiSummary>;

// date only: label is locale-formatted text ("Feb 23" for a day bucket, "Sep"
// for a month), and formatting differs by range in a way only this module
// -- which chose the range -- already knows.
const cashFlowPointSchema = z.object({
  date: z.string(),
  expected_cents: z.number().int(),
  actual_cents: z.number().int(),
  overdue_cents: z.number().int(),
});

const agingBucketSchema = z.object({
  key: agingBucketKeySchema,
  amount_cents: z.number().int(),
  invoice_count: z.number().int(),
  share: z.number(),
}) satisfies z.ZodType<Omit<AgingBucket, "label">>;

// label is fixed display text per key, not data -- same reasoning as the
// cash-flow date labels: the backend sends the key, this module (which
// already knows every key) renders the text.
const BUCKET_LABEL: Record<AgingBucketKey, string> = {
  current: "Current",
  "1_30": "1–30",
  "31_60": "31–60",
  "61_90": "61–90",
  "90_plus": "90+",
};

const agingByCustomerRowSchema = z.object({
  customer_id: z.uuid(),
  customer_name: z.string(),
  cells: z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int(), z.number().int()]),
  total_cents: z.number().int(),
});

const agingSchema = z.object({
  buckets: z.array(agingBucketSchema),
  by_customer: z.array(agingByCustomerRowSchema),
});

export type CashFlowRange = "7d" | "30d" | "90d" | "12m";

const DAY_LABEL = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const MONTH_LABEL = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

export const getSummary = cache(async () =>
  apiFetch("/reports/summary", { schema: kpiSummarySchema }));

export const getCashFlow = cache(async (range: CashFlowRange): Promise<CashFlowPoint[]> => {
  const { data } = await apiFetch(`/reports/cash-flow?range=${range}`, {
    schema: z.object({ data: z.array(cashFlowPointSchema) }),
  });
  const label = range === "12m" ? MONTH_LABEL : DAY_LABEL;
  return data.map((point) => ({ ...point, label: label(point.date) }));
});

export const getAging = cache(async () => {
  const { buckets, by_customer } = await apiFetch("/reports/aging", { schema: agingSchema });
  return { buckets: buckets.map((b) => ({ ...b, label: BUCKET_LABEL[b.key] })), by_customer };
});
