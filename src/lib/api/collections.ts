import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { CollectionStage, NeedsAttentionItem } from "@/types";
import { apiFetch } from "./client";
import { invoiceSchema, riskSchema } from "./invoices";

const stageSchema = z.enum([
  "upcoming",
  "due_today",
  "late_1_30",
  "late_31_60",
  "late_60_plus",
]) satisfies z.ZodType<CollectionStage>;

const pipelineRowSchema = invoiceSchema.extend({ stage: stageSchema });

// Not listOf(): a flat, complete list of every open invoice, grouped into
// columns client-side -- stage labels and column order are UI config, the
// same reasoning getPaymentBehaviour's month labels used.
const pipelineSchema = z.object({ data: z.array(pipelineRowSchema) });

const needsAttentionItemSchema = z.object({
  invoice_id: z.uuid(),
  invoice_number: z.string(),
  customer_id: z.uuid(),
  customer_name: z.string(),
  balance_cents: z.number().int(),
  days_overdue: z.number().int(),
  risk: riskSchema,
  recommended_action: z.string(),
  ai_note: z.string().nullable(),
}) satisfies z.ZodType<NeedsAttentionItem>;

// Not listOf() either: a fixed-size ranked digest, not something paged
// through.
const queueSchema = z.object({ data: z.array(needsAttentionItemSchema) });

export const getPipeline = cache(async () =>
  apiFetch("/collections/pipeline", { schema: pipelineSchema }));

export const getCollectionQueue = cache(async (limit?: number) =>
  apiFetch(`/collections/queue${limit ? `?limit=${limit}` : ""}`, { schema: queueSchema }));
