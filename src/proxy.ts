import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
  sessionCookieOptions,
} from "@/lib/auth/cookies";

/**
 * Two jobs, and deliberately no third.
 *
 * 1. The optimistic check: is there a session cookie at all. This is a
 *    redirect convenience, never the authorisation — FastAPI verifies every
 *    request, and a forged cookie gets a 401 from the DAL regardless.
 * 2. Refresh rotation. Refreshing writes cookies, and Next does not allow
 *    cookie writes during a Server Component render, so this is the only place
 *    in the render path that can do it.
 *
 * No database calls: this runs on every navigation including prefetches.
 */
const SIGNED_IN_ROOTS = [
  "/dashboard",
  "/invoices",
  "/customers",
  "/collections",
  "/payments",
  "/reports",
  "/automations",
  "/integrations",
  "/settings",
  "/ai",
  "/onboarding",
];

const SIGNED_OUT_ONLY = ["/login", "/signup", "/forgot-password"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  const isProtected = SIGNED_IN_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
  const isAuthPage = SIGNED_OUT_ONLY.includes(pathname);

  if (access) {
    if (isAuthPage) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // No access token but a refresh token: the 30-minute access token expired
  // between navigations. Swap it before the page renders, so the person never
  // sees a login screen they did not ask for.
  if (refresh) {
    const rotated = await rotate(refresh);
    if (rotated) {
      const response = isAuthPage
        ? NextResponse.redirect(new URL("/dashboard", request.url))
        : NextResponse.next();
      response.cookies.set(
        ACCESS_COOKIE,
        rotated.access_token,
        sessionCookieOptions(rotated.expires_in),
      );
      response.cookies.set(
        REFRESH_COOKIE,
        rotated.refresh_token,
        sessionCookieOptions(REFRESH_MAX_AGE),
      );
      return response;
    }

    // Rotation failed: the token was reused, revoked or expired. Clear both
    // cookies, or every subsequent navigation retries a rotation that cannot
    // succeed.
    const response = isProtected
      ? NextResponse.redirect(new URL("/login", request.url))
      : NextResponse.next();
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  }

  if (isProtected) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

async function rotate(
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null> {
  try {
    const response = await fetch(
      `${process.env.API_BASE_URL ?? "http://127.0.0.1:8000"}/api/auth/refresh`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      tokens: { access_token: string; refresh_token: string; expires_in: number };
    };
    return body.tokens;
  } catch {
    // The backend being unreachable must not hard-fail every navigation.
    return null;
  }
}

export const config = {
  // Without a matcher the proxy runs on static assets too, and the redirect
  // above would block CSS and images from loading.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
