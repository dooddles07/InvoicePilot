import { ANNUAL_DISCOUNT_PERCENT, FAQS, GUARANTEE, PLANS, SITE } from "@/lib/marketing";

/**
 * Machine-readable pricing for AI agents.
 *
 * Generated from `marketing.ts` rather than kept as a static file, because a
 * stale price file is worse than none: an assistant comparing tools will quote
 * whatever it can parse, and it will not know the page says something else.
 */
export const dynamic = "force-static";

export function GET() {
  const lines: string[] = [
    `# Pricing — ${SITE.name}`,
    "",
    SITE.description,
    "",
    "All prices in USD. Charged per workspace, per month — not per seat.",
    "Every plan includes unlimited team members.",
    `Annual billing saves ${ANNUAL_DISCOUNT_PERCENT}%.`,
    "14-day free trial. No card required to start.",
    "",
  ];

  for (const plan of PLANS) {
    lines.push(
      `## ${plan.name}`,
      "",
      `- For: ${plan.audience}`,
      `- Price: $${plan.annual}/month (billed annually) | $${plan.monthly}/month (billed monthly)`,
      `- Invoices: ${plan.limits.invoices}`,
      `- Customers: ${plan.limits.customers}`,
      `- Automations: ${plan.limits.automations}`,
      `- AI actions: ${plan.limits.ai}`,
      `- Team members: unlimited`,
      `- Includes: ${plan.highlights.join("; ")}`,
      "",
    );
  }

  lines.push(
    "## Guarantee",
    "",
    `${GUARANTEE.headline}. ${GUARANTEE.body}`,
    "",
    "## Common questions",
    "",
  );

  for (const faq of FAQS) {
    lines.push(`### ${faq.question}`, "", faq.answer, "");
  }

  lines.push(
    "## Canonical sources",
    "",
    `- Pricing page: ${SITE.url}/pricing`,
    `- FAQ: ${SITE.url}/faq`,
    `- Product overview: ${SITE.url}/llms.txt`,
    "",
  );

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
