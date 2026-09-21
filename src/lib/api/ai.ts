import "server-only";

import { z } from "zod";

import type { AIActionKind, AIAnswer } from "@/types";
import { apiFetch } from "./client";

const actionKindSchema = z.enum([
  "send_reminder",
  "send_escalation",
  "schedule_call",
  "flag_review",
]) satisfies z.ZodType<AIActionKind>;

const aiAnswerSchema = z.object({
  id: z.string(),
  question: z.string(),
  headline: z.string(),
  detail: z.string(),
  metrics: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      direction: z.enum(["up", "down", "flat"]).nullable(),
    }),
  ),
  contributors: z.array(
    z.object({
      label: z.string(),
      value_cents: z.number().int(),
      share: z.number(),
      href: z.string(),
    }),
  ),
  recommended_action: z.string(),
  action_kind: actionKindSchema,
  requires_confirmation: z.literal(true),
}) satisfies z.ZodType<AIAnswer>;

// Not cache()-wrapped: the question varies per call, so there is nothing to
// dedupe. Called only from src/lib/actions/ai.ts.
export const postAsk = (question: string) =>
  apiFetch("/ai/ask", { method: "POST", body: { question }, schema: aiAnswerSchema });
