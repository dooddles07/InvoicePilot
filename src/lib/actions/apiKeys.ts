"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ApiError } from "@/lib/api/client";
import { deleteApiKey, postApiKey } from "@/lib/api/apiKeys";
import type { ApiKey } from "@/types";

function fail(error: unknown, fallback: string): { ok: false; message: string } {
  if (error instanceof ApiError && error.status !== 500) {
    return { ok: false, message: error.detail };
  }
  return { ok: false, message: fallback };
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  scopes: z.array(z.enum(["read", "write"])).min(1),
});

export type CreateApiKeyResult =
  | { ok: true; apiKey: ApiKey & { key: string } }
  | { ok: false; message: string };

export async function createApiKey(input: unknown): Promise<CreateApiKeyResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Name it and choose at least one scope." };

  try {
    const apiKey = await postApiKey(parsed.data);
    revalidatePath("/settings/api-keys");
    return { ok: true, apiKey };
  } catch (error) {
    return fail(error, "Could not create the key. Try again.");
  }
}

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function revokeApiKey(keyId: string): Promise<ActionResult> {
  try {
    await deleteApiKey(keyId);
  } catch (error) {
    return fail(error, "Could not revoke the key. Try again.");
  }
  revalidatePath("/settings/api-keys");
  return { ok: true };
}
