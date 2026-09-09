"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ApiError, apiFetch } from "@/lib/api/client";
import { sessionUserSchema } from "@/lib/api/session";
import {
  clearSessionCookies,
  readRefreshToken,
  setSessionCookies,
} from "@/lib/auth/cookies";

/**
 * Actions return a result instead of throwing.
 *
 * A thrown error in a Server Action replaces the page with the error boundary,
 * which is the wrong response to "that password is wrong" — the person needs
 * the form back, with the message next to the field.
 */
export type ActionResult =
  | { ok: true }
  | { ok: false; message: string; field?: "email" | "password" | "full_name" };

const authResponseSchema = z.object({
  tokens: z.object({
    access_token: z.string(),
    refresh_token: z.string(),
    expires_in: z.number(),
  }),
  user: sessionUserSchema,
});

// The same rules as the form's Zod schema, restated server-side: a Server
// Action is a public endpoint, and the client's validation is a convenience.
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signupSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(10),
});

export async function login(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Check your email and password.", field: "email" };
  }

  try {
    const result = await apiFetch("/auth/login", {
      method: "POST",
      body: parsed.data,
      schema: authResponseSchema,
      token: null,
    });
    await setSessionCookies(result.tokens);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // Deliberately not "no account with that email": the backend refuses to
      // distinguish the two, and so must the message the form shows.
      return {
        ok: false,
        message: "That email and password do not match.",
        field: "password",
      };
    }
    return { ok: false, message: "Something went wrong. Try again." };
  }
}

export async function signup(input: unknown): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Check the form and try again.", field: "email" };
  }

  try {
    const result = await apiFetch("/auth/signup", {
      method: "POST",
      body: parsed.data,
      schema: authResponseSchema,
      token: null,
    });
    await setSessionCookies(result.tokens);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return {
        ok: false,
        message: "An account with that email already exists.",
        field: "email",
      };
    }
    return { ok: false, message: "Something went wrong. Try again." };
  }
}

export async function logout(): Promise<ActionResult> {
  const refreshToken = await readRefreshToken();
  // Cookies are cleared whatever the backend says. A failed revoke must not
  // leave someone apparently signed in on a shared machine.
  await clearSessionCookies();

  if (refreshToken) {
    try {
      await apiFetch("/auth/logout", {
        method: "POST",
        body: { refresh_token: refreshToken },
        schema: z.undefined(),
        token: null,
      });
    } catch {
      // Already revoked, or the backend is down. Either way, signed out here.
    }
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function switchWorkspace(workspaceId: string): Promise<ActionResult> {
  try {
    const result = await apiFetch("/auth/switch-workspace", {
      method: "POST",
      body: { workspace_id: workspaceId },
      schema: authResponseSchema,
    });
    await setSessionCookies(result.tokens);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { ok: false, message: "You no longer have access to that workspace." };
    }
    return { ok: false, message: "Could not switch workspace." };
  }
}
