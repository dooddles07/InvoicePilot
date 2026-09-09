import { cookies } from "next/headers";

/**
 * The two session cookies.
 *
 * Both are httpOnly, so nothing the browser runs can read either one. That is
 * the whole reason the token lives here rather than in localStorage: an XSS
 * bug becomes a bug rather than a session theft.
 */
export const ACCESS_COOKIE = "ip_at";
export const REFRESH_COOKIE = "ip_rt";

export const REFRESH_MAX_AGE = 14 * 24 * 60 * 60;

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    // Off in development because localhost is not https; a secure cookie there
    // is simply never sent, and the symptom is a login that appears to do
    // nothing.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

/** Only callable from a Server Action or Route Handler — Next forbids cookie
 *  writes during a Server Component render. */
export async function setSessionCookies(tokens: TokenPair) {
  const store = await cookies();
  store.set(ACCESS_COOKIE, tokens.access_token, sessionCookieOptions(tokens.expires_in));
  store.set(REFRESH_COOKIE, tokens.refresh_token, sessionCookieOptions(REFRESH_MAX_AGE));
}

export async function clearSessionCookies() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export async function readAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value ?? null;
}

export async function readRefreshToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE)?.value ?? null;
}
