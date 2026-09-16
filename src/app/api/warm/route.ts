/**
 * Wakes the Render instance while the visitor is still reading.
 *
 * Render suspends a free service after fifteen minutes idle, and waking it
 * measured 21.8 seconds. A visitor who spends that long on the landing page
 * before clicking "View live demo" pays none of it.
 *
 * Answers 204 on every path, including failure: a warm-up that did not work
 * is not the visitor's problem and must never surface on the page.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = process.env.API_BASE_URL;
  if (!baseUrl) return new Response(null, { status: 204 });

  try {
    await fetch(`${baseUrl}/health`, { cache: "no-store" });
  } catch {
    // Deliberately silent.
  }

  return new Response(null, { status: 204 });
}
