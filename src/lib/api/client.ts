import "server-only";

import { notFound, redirect } from "next/navigation";
import type { ZodType } from "zod";

import { readAccessToken } from "@/lib/auth/cookies";

/**
 * The only place in the frontend that builds a URL to FastAPI.
 *
 * Pages and actions import functions from `src/lib/api/`; none of them knows a
 * path. That is what keeps the API surface changeable without a grep across
 * the app directory.
 */
const BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`${status}: ${detail}`);
    this.name = "ApiError";
  }
}

type RequestOptions<T> = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  schema: ZodType<T>;
  /** Pass explicitly when the caller holds a token the cookie does not yet
   *  have — a login response, or proxy.ts mid-rotation. */
  token?: string | null;
  /** Next cache tags for reads. Writes pass nothing and are never cached. */
  tags?: string[];
};

export async function apiFetch<T>(
  path: string,
  options: RequestOptions<T>,
): Promise<T> {
  const token =
    options.token === undefined ? await readAccessToken() : options.token;

  const response = await fetch(`${BASE_URL}/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    // Every response is per-user. Caching one would serve one tenant's ledger
    // to another.
    cache: "no-store",
    ...(options.tags ? { next: { tags: options.tags } } : {}),
  });

  if (!response.ok) {
    const detail = await readDetail(response);
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) return options.schema.parse(undefined);

  // Parsed rather than cast: an unvalidated `as` turns a backend field rename
  // into `undefined` inside a currency formatter, three screens away.
  return options.schema.parse(await response.json());
}

async function readDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === "string" ? body.detail : response.statusText;
  } catch {
    return response.statusText;
  }
}

/**
 * The read-path error policy from the spec: 401 means the session is gone,
 * 404 means render the not-found page, anything else reaches the existing
 * error boundary.
 */
export function handleReadError(error: unknown): never {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/login");
    if (error.status === 404) notFound();
  }
  throw error;
}
