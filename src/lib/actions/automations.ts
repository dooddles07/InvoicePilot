"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ApiError } from "@/lib/api/client";
import { patchAutomation, postAutomation } from "@/lib/api/automations";
import type { AutomationNode } from "@/types";

function fail(error: unknown, fallback: string): { ok: false; message: string } {
  if (error instanceof ApiError && error.status !== 500) {
    return { ok: false, message: error.detail };
  }
  return { ok: false, message: fallback };
}

const nodeSchema: z.ZodType<AutomationNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.enum(["trigger", "delay", "condition", "email", "sms", "notification", "webhook"]),
    title: z.string(),
    detail: z.string(),
    branches: z
      .array(z.object({ label: z.string(), nodes: z.array(nodeSchema) }))
      .optional(),
  }),
);

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  trigger_days: z.number().int().min(0).max(365),
  tone: z.enum(["friendly", "firm", "final"]),
  nodes: z.array(nodeSchema),
});

export type CreateAutomationResult =
  | { ok: true; automationId: string }
  | { ok: false; message: string };

export async function createAutomation(input: unknown): Promise<CreateAutomationResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Name it and set a trigger before saving." };

  const days = parsed.data.trigger_days;
  try {
    const automation = await postAutomation({
      ...parsed.data,
      trigger_label: `${days} day${days === 1 ? "" : "s"} overdue`,
    });
    revalidatePath("/automations");
    return { ok: true, automationId: automation.id };
  } catch (error) {
    return fail(error, "Could not create the automation. Try again.");
  }
}

const updateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    enabled: z.boolean().optional(),
    nodes: z.array(nodeSchema).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "At least one field is required");

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function updateAutomation(automationId: string, input: unknown): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Nothing to save." };

  try {
    await patchAutomation(automationId, parsed.data);
  } catch (error) {
    return fail(error, "Could not save the automation. Try again.");
  }
  revalidatePath(`/automations/${automationId}`);
  revalidatePath("/automations");
  return { ok: true };
}
