import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { Automation, AutomationNode, AutomationRun } from "@/types";
import { apiFetch } from "./client";

const toneSchema = z.enum(["friendly", "firm", "final"]);

const automationNodeSchema: z.ZodType<AutomationNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.enum(["trigger", "delay", "condition", "email", "sms", "notification", "webhook"]),
    title: z.string(),
    detail: z.string(),
    branches: z
      .array(z.object({ label: z.string(), nodes: z.array(automationNodeSchema) }))
      .optional(),
  }),
);

const automationSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  trigger_label: z.string(),
  trigger_days: z.number().int(),
  tone: toneSchema,
  nodes: z.array(automationNodeSchema),
  runs_30d: z.number().int(),
  recovered_cents_30d: z.number(),
  last_run_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}) satisfies z.ZodType<Automation>;

// Not listOf(): list() takes no query params and answers the complete set.
const automationListSchema = z.object({ data: z.array(automationSchema) });

export const getAutomations = cache(async () =>
  apiFetch("/automations", { schema: automationListSchema }));

export const getAutomation = cache(async (automationId: string) =>
  apiFetch(`/automations/${automationId}`, { schema: automationSchema }));

const automationRunSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  automation_id: z.uuid(),
  matched_count: z.number().int(),
  sent_count: z.number().int(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
}) satisfies z.ZodType<AutomationRun>;

const automationRunListSchema = z.object({ data: z.array(automationRunSchema) });

export const getAutomationRuns = cache(async (automationId: string) =>
  apiFetch(`/automations/${automationId}/runs`, { schema: automationRunListSchema }));

/* ---------- writes ----------
 * Not cache()-wrapped. Called only from src/lib/actions/automations.ts.
 */

export type CreateAutomationInput = {
  name: string;
  description?: string;
  trigger_label: string;
  trigger_days: number;
  tone?: "friendly" | "firm" | "final";
  nodes?: AutomationNode[];
};

export const postAutomation = (body: CreateAutomationInput) =>
  apiFetch("/automations", { method: "POST", body, schema: automationSchema });

// trigger_days and tone are fixed at creation -- see the schema comment on
// automations.trigger_days -- so there is nothing here to update them with.
export type UpdateAutomationInput = {
  name?: string;
  description?: string;
  enabled?: boolean;
  nodes?: AutomationNode[];
};

export const patchAutomation = (automationId: string, body: UpdateAutomationInput) =>
  apiFetch(`/automations/${automationId}`, { method: "PATCH", body, schema: automationSchema });
