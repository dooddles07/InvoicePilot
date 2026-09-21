import type { Metadata, ResolvingMetadata } from "next";

import { FaqSection } from "@/components/marketing/faq-section";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import {
  AiSection,
  AutomationSection,
  CashFlowSection,
  FinalCta,
  Hero,
  Problem,
  ProductOverview,
  SocialProof,
  Testimonials,
} from "@/components/marketing/sections";
import { StructuredData } from "@/components/marketing/structured-data";
import { Reveal } from "@/components/motion/reveal";
import { SITE } from "@/lib/marketing";

export async function generateMetadata(
  _props: unknown,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  // A static `openGraph` object here would replace the parent's, not merge
  // with it — the root's file-convention opengraph-image.tsx is inherited as
  // part of that parent openGraph, so it has to be spread in explicitly or
  // og:image quietly disappears from the one page most likely to be shared.
  const { openGraph } = await parent;
  return {
    title: {
      absolute: "InvoicePilot — Get paid faster. Without chasing invoices.",
    },
    description: SITE.description,
    alternates: { canonical: "/" },
    openGraph: {
      ...openGraph,
      title: "InvoicePilot — Get paid faster. Without chasing invoices.",
      description: SITE.description,
      type: "website",
      url: SITE.url,
    },
  };
}

export default function LandingPage() {
  return (
    <>
      <StructuredData include={["organization", "software", "faq"]} />

      <Hero />
      <SocialProof />
      <Problem />
      <ProductOverview />
      <AiSection />
      <AutomationSection />
      <CashFlowSection />
      <Testimonials />

      <section id="pricing" className="border-b scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <Reveal className="mb-8 max-w-2xl">
            <h2 className="text-h1 font-semibold tracking-tight text-balance">
              Priced per workspace, not per seat
            </h2>
            <p className="text-muted-foreground mt-3 text-body">
              Collections is a team sport, and the person who chases an invoice
              is rarely the person who issued it. Charging per seat would tax you
              for adding the teammate who does the chasing.
            </p>
          </Reveal>

          <PricingPlans compact />
        </div>
      </section>

      <section className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <FaqSection id="home-faq" />
        </div>
      </section>

      <FinalCta />
    </>
  );
}
