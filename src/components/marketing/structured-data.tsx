import { FAQS, PLANS, SITE } from "@/lib/marketing";

/**
 * JSON-LD, generated from the same constants the page renders.
 *
 * Schema that disagrees with the visible page is worse than no schema — it is
 * a guideline violation and it teaches an assistant the wrong price. Building
 * it from `marketing.ts` makes the two impossible to drift apart.
 */
export function StructuredData({
  include = ["organization", "software", "faq"],
}: {
  include?: ("organization" | "software" | "faq")[];
}) {
  const graph: Record<string, unknown>[] = [];

  if (include.includes("organization")) {
    graph.push({
      "@type": "Organization",
      "@id": `${SITE.url}/#organization`,
      name: SITE.name,
      url: SITE.url,
      description: SITE.description,
      slogan: SITE.tagline,
    });
    graph.push({
      "@type": "WebSite",
      "@id": `${SITE.url}/#website`,
      name: SITE.name,
      url: SITE.url,
      publisher: { "@id": `${SITE.url}/#organization` },
    });
  }

  if (include.includes("software")) {
    graph.push({
      "@type": "SoftwareApplication",
      "@id": `${SITE.url}/#software`,
      name: SITE.name,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Accounts Receivable Automation",
      operatingSystem: "Web",
      description: SITE.description,
      publisher: { "@id": `${SITE.url}/#organization` },
      offers: PLANS.map((plan) => ({
        "@type": "Offer",
        name: plan.name,
        description: plan.audience,
        price: plan.annual.toFixed(2),
        priceCurrency: "USD",
        url: `${SITE.url}/pricing`,
        availability: "https://schema.org/InStock",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: plan.annual.toFixed(2),
          priceCurrency: "USD",
          unitCode: "MON",
          billingIncrement: 1,
          description: `Per workspace, per month, billed annually. $${plan.monthly} billed monthly.`,
        },
      })),
    });
  }

  if (include.includes("faq")) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${SITE.url}/faq#faqpage`,
      mainEntity: FAQS.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    });
  }

  return (
    <script
      type="application/ld+json"
      // The payload is built from local constants, never from user input.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }),
      }}
    />
  );
}
