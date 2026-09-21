/**
 * Resend delivery. The only thing this module does is turn a
 * (to, subject, html) into a provider message id or an error string --
 * writing the communication_logs row is the caller's job, because the row
 * must exist before this is even called (log first, deliver second).
 *
 * Resend's sandbox mode -- no verified sending domain, which is what staying
 * on the free Vercel URL implies -- only delivers to the account's own
 * verified address. config.resendToEmail is that address; every real send
 * goes there regardless of whose invoice it is, and the caller records the
 * customer's real address on the log row so the audit trail still reads
 * correctly.
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM = "InvoicePilot <onboarding@resend.dev>";

export async function deliverEmail(config, { to, subject, html }) {
  if (!config.resendApiKey) {
    return { sent: false, providerMessageId: null, error: "RESEND_API_KEY not configured" };
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [config.resendToEmail || to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return { sent: false, providerMessageId: null, error: detail.slice(0, 500) };
  }

  const data = await response.json();
  return { sent: true, providerMessageId: data.id, error: null };
}
