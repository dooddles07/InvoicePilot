import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ApiError, apiFetch } from "@/lib/api/client";
import { readAccessToken } from "@/lib/auth/cookies";

export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  full_name: z.string(),
  avatar_url: z.string().nullable(),
  workspace_id: z.string(),
  workspace_name: z.string(),
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

/**
 * Who is signed in, according to FastAPI.
 *
 * The DAL does not verify the JWT itself: that would mean sharing SECRET_KEY
 * with Next for no gain. It forwards the token and lets the service that
 * signed it decide. Wrapped in cache() so a layout, a page and three
 * components asking during one render make one request.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = await readAccessToken();
  if (!token) return null;

  try {
    return await apiFetch("/users/me", { schema: sessionUserSchema, token });
  } catch (error) {
    // An expired access token is an ordinary event: proxy.ts refreshes on the
    // next navigation. Treating it as signed-out here is correct and quiet.
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
});

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
