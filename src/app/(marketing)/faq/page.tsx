import type { Metadata } from "next";
import Link from "next/link";

import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCta } from "@/components/marketing/sections";
import { StructuredData } from "@/components/marketing/structured-data";
import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = {
  title: { absolute: "FAQ — InvoicePilot" },
  description:
    "Answers about InvoicePilot: what it does, what it costs, how long setup takes, which accounting tools it syncs with, what the AI actually does, and what happens to your data if you cancel.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  return (
    <>
      <StructuredData include={["faq"]} />

      <section className="border-b">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <Reveal>
            <h1 className="text-h1 font-semibold tracking-tight text-balance sm:text-display">
              Frequently asked questions
            </h1>
            <p className="text-muted-foreground mt-3 text-body">
              If the answer you need is not here, the{" "}
              <Link href="/dashboard" className="text-brand hover:underline">
                demo workspace
              </Link>{" "}
              is open — every screen is populated and nothing asks for a card.
            </p>
            <p className="text-muted-foreground mt-2 text-caption">
              Last updated 8 September 2026.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <FaqSection id="faq" heading="Product and pricing" />
        </div>
      </section>

      <FinalCta />
    </>
  );
}
