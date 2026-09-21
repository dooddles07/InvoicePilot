import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { ApiKey } from "@/types";
import { apiFetch } from "./client";

const apiKeySchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  name: z.string(),
  last_four: z.string(),
  scopes: z.array(z.enum(["read", "write"])),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
}) satisfies z.ZodType<ApiKey>;

// Not listOf(): list() takes no query params and answers the complete set.
const apiKeyListSchema = z.object({ data: z.array(apiKeySchema) });

export const getApiKeys = cache(async () =>
  apiFetch("/api-keys", { schema: apiKeyListSchema }));

// Not cache()-wrapped: mutations, called only from src/lib/actions/apiKeys.ts.
export type CreateApiKeyInput = { name: string; scopes: ("read" | "write")[] };

// The only response that ever carries the plaintext key.
const createdApiKeySchema = apiKeySchema.extend({ key: z.string() });

export const postApiKey = (body: CreateApiKeyInput) =>
  apiFetch("/api-keys", { method: "POST", body, schema: createdApiKeySchema });

export const deleteApiKey = (keyId: string) =>
  apiFetch(`/api-keys/${keyId}`, { method: "DELETE", schema: z.void() });
