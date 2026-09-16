"use server";

import { revalidatePath } from "next/cache";

import { ApiError, apiFetch } from "@/lib/api/client";
import { authResponseSchema } from "@/lib/api/session";
import { setSessionCookies } from "@/lib/auth/cookies";
import type { ActionResult } from "@/lib/actions/auth";

/**
 * Signs a visitor into the shared demo workspace.
 *
 * This is an ordinary login the visitor does not have to type — no new
 * authentication surface, no second code path. The credentials belong to the
 * account `npm run seed` created in backend/, and they never reach a browser:
 * this runs on the server and only the resulting cookies are sent back.
 *
 * Returns a result instead of throwing, for the same reason the login action
 * does: a thrown error replaces the page with the error boundary, which is the
 * wrong answer to "the demo server is still waking up".
 */
export async function enterDemo(): Promise<ActionResult> {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;

  if (!email || !password) {
    return {
      ok: false,
      message:
        "The demo is unavailable right now. You can create a workspace instead — it takes about a minute.",
    };
  }

  try {
    const result = await apiFetch("/auth/login", {
      method: "POST",
      body: { email, password },
      schema: authResponseSchema,
      token: null,
    });
    await setSessionCookies(result.tokens);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    // A reseed between sessions can invalidate the account mid-flight. That is
    // a "try again", not a broken deployment.
    if (error instanceof ApiError && error.status === 401) {
      return {
        ok: false,
        message: "The demo workspace is being rebuilt. Try again in a moment.",
      };
    }
    return {
      ok: false,
      message: "The demo server is taking longer than usual to wake up.",
    };
  }
}
