/**
 * The daily demo reset, and the once-a-day automation/webhook-retry sweep
 * right after it.
 *
 * Vercel's cron calls this with `Authorization: Bearer ${CRON_SECRET}`; this
 * handler forwards to the Express service with the admin token. The token
 * never reaches a browser: this runs on the server, and the route answers
 * nothing useful without the cron secret.
 *
 * Vercel Hobby allows one cron schedule; run-daily rides this same firing
 * rather than asking for a second one, after the reseed so it evaluates the
 * freshly rebuilt ledger instead of the one about to be deleted.
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

  const headers = { "Content-Type": "application/json", "X-Admin-Token": adminToken };

  const reseedResponse = await fetch(`${baseUrl}/api/admin/reseed`, {
    method: "POST",
    headers,
    cache: "no-store",
  });

  // Read as text first: a sleeping Render service answers 502 in HTML, and
  // response.json() would throw on it and turn a clear 502 into an opaque 500.
  const reseedBody = await reseedResponse.text();
  if (!reseedResponse.ok) {
    // The ledger run-daily would evaluate is either gone or about to be
    // replaced -- skip it rather than run automations against a workspace
    // reseed just failed to rebuild.
    return new Response(reseedBody || JSON.stringify({ detail: reseedResponse.statusText }), {
      status: reseedResponse.status,
      headers: { "Content-Type": reseedResponse.headers.get("content-type") ?? "application/json" },
    });
  }

  const dailyResponse = await fetch(`${baseUrl}/api/admin/run-daily`, {
    method: "POST",
    headers,
    cache: "no-store",
  });
  const dailyBody = await dailyResponse.text();

  return Response.json(
    {
      reseed: JSON.parse(reseedBody),
      run_daily: dailyResponse.ok ? JSON.parse(dailyBody) : { error: dailyBody },
    },
    { status: dailyResponse.ok ? 200 : 207 },
  );
}
