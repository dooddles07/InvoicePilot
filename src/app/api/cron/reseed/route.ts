/**
 * The daily demo reset.
 *
 * Vercel's cron calls this with `Authorization: Bearer ${CRON_SECRET}`; this
 * handler forwards to the Express service with the admin token. The token
 * never reaches a browser: this runs on the server, and the route answers
 * nothing useful without the cron secret.
 *
 * Render suspends a free service after 15 minutes idle and Neon after five, so
 * a cold call pays both wake-ups before the reseed starts. 60 seconds is the
 * most a Vercel hobby function may run; if that is not enough the cron fails
 * and the demo keeps yesterday's ledger until the next run, which is a stale
 * demo rather than a broken one. The fallback, if it becomes chronic, is a
 * scheduled GitHub Actions workflow calling this same path.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const adminToken = process.env.ADMIN_TOKEN;
  const baseUrl = process.env.API_BASE_URL;

  if (!cronSecret || !adminToken || !baseUrl) {
    return Response.json({ detail: "Reseed is not configured" }, { status: 500 });
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ detail: "Invalid credentials" }, { status: 401 });
  }

  const response = await fetch(`${baseUrl}/api/admin/reseed`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": adminToken },
    cache: "no-store",
  });

  // Pass the backend's own status through, so a failed reseed is visible in
  // Vercel's cron log rather than reported as a success. Read as text first: a
  // sleeping Render service answers 502 in HTML, and response.json() would
  // throw on it and turn a clear 502 into an opaque 500.
  const body = await response.text();
  return new Response(body || JSON.stringify({ detail: response.statusText }), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
