import type { Metadata } from "next";

import { FaqSection } from "@/components/marketing/faq-section";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { FinalCta } from "@/components/marketing/sections";
import { StructuredData } from "@/components/marketing/structured-data";
import { Reveal } from "@/components/motion/reveal";
import { ANNUAL_DISCOUNT_PERCENT } from "@/lib/marketing";

export const metadata: Metadata = {
  title: { absolute: "Pricing — InvoicePilot" },
  description:
    "InvoicePilot pricing: Starter $29, Professional $82 and Scale $249 per month billed annually. Priced per workspace with unlimited team members on every plan. 14-day free trial, no card required.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <>
      <StructuredData include={["software", "faq"]} />

      <section className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h1 className="text-h1 font-semibold tracking-tight text-balance sm:text-display">
              Pricing that does not punish you for growing a team
            </h1>
            <p className="text-muted-foreground mt-3 text-body">
              Every plan includes unlimited team members. You pay for the size of
              the book you are collecting, not the number of people helping.
              Annual billing saves {ANNUAL_DISCOUNT_PERCENT}%.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <PricingPlans />
        </div>
      </section>

      <section className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <FaqSection
            id="pricing-faq"
            heading="Pricing questions, answered plainly"
          />
        </div>
      </section>

      <FinalCta />
    </>
  );
}
