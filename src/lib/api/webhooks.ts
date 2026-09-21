import "server-only";

import { cache } from "react";
import { z } from "zod";

import { WEBHOOK_EVENTS, type WebhookEndpoint } from "@/types";
import { apiFetch } from "./client";

const webhookEndpointSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  url: z.string(),
  events: z.array(z.string()),
  status: z.enum(["active", "failing", "paused"]),
  last_delivery_at: z.string().nullable(),
  failure_count: z.number().int(),
}) satisfies z.ZodType<WebhookEndpoint>;

// Not listOf(): list() takes no query params and answers the complete set.
const webhookListSchema = z.object({ data: z.array(webhookEndpointSchema) });

export const getWebhooks = cache(async () =>
  apiFetch("/webhooks", { schema: webhookListSchema }));

// Not cache()-wrapped: mutations, called only from src/lib/actions/webhooks.ts.
export type CreateWebhookInput = {
  url: string;
  events: (typeof WEBHOOK_EVENTS)[number][];
};

// The only response that ever carries the signing secret.
const createdWebhookSchema = webhookEndpointSchema.extend({ secret: z.string() });

export const postWebhook = (body: CreateWebhookInput) =>
  apiFetch("/webhooks", { method: "POST", body, schema: createdWebhookSchema });

export const deleteWebhook = (endpointId: string) =>
  apiFetch(`/webhooks/${endpointId}`, { method: "DELETE", schema: z.void() });

const testResultSchema = z.object({
  delivered: z.boolean(),
  response_status: z.number().int().nullable(),
});

export const postWebhookTest = (endpointId: string) =>
  apiFetch(`/webhooks/${endpointId}/test`, { method: "POST", schema: testResultSchema });
