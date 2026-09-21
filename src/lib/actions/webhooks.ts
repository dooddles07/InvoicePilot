"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ApiError } from "@/lib/api/client";
import { deleteWebhook, postWebhook, postWebhookTest } from "@/lib/api/webhooks";
import { WEBHOOK_EVENTS, type WebhookEndpoint } from "@/types";

function fail(error: unknown, fallback: string): { ok: false; message: string } {
  if (error instanceof ApiError && error.status !== 500) {
    return { ok: false, message: error.detail };
  }
  return { ok: false, message: fallback };
}

const createSchema = z.object({
  url: z.url().max(500),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

export type CreateWebhookResult =
  | { ok: true; endpoint: WebhookEndpoint & { secret: string } }
  | { ok: false; message: string };

export async function createWebhook(input: unknown): Promise<CreateWebhookResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter a valid URL and choose at least one event." };

  try {
    const endpoint = await postWebhook(parsed.data);
    revalidatePath("/settings/webhooks");
    return { ok: true, endpoint };
  } catch (error) {
    return fail(error, "Could not add the endpoint. Try again.");
  }
}

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function removeWebhook(endpointId: string): Promise<ActionResult> {
  try {
    await deleteWebhook(endpointId);
  } catch (error) {
    return fail(error, "Could not remove the endpoint. Try again.");
  }
  revalidatePath("/settings/webhooks");
  return { ok: true };
}

export type SendTestResult =
  | { ok: true; delivered: boolean; responseStatus: number | null }
  | { ok: false; message: string };

export async function sendTestWebhook(endpointId: string): Promise<SendTestResult> {
  try {
    const result = await postWebhookTest(endpointId);
    revalidatePath("/settings/webhooks");
    return { ok: true, delivered: result.delivered, responseStatus: result.response_status };
  } catch (error) {
    return fail(error, "Could not send the test event. Try again.");
  }
}
