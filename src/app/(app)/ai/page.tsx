import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { AskInvoicePilot } from "@/components/ai/ask-invoicepilot";
import { PageHeader } from "@/components/invoicepilot/page-header";
import { Reveal } from "@/components/motion/reveal";
import { answerFor, SUGGESTED_QUESTIONS } from "@/lib/data";
import type { AIAnswer } from "@/types";

export const metadata: Metadata = { title: "Ask InvoicePilot" };

export default function AskPage() {
  // Answers are computed on the server from the same ledger every other screen
  // reads, so what the assistant says can always be checked against a table.
  const answers = Object.fromEntries(
    SUGGESTED_QUESTIONS.map((q) => [q, answerFor(q)]),
  ) as Record<string, AIAnswer>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Reveal>
        <PageHeader
          title="Ask InvoicePilot"
          description="Questions about your receivables, answered from your own ledger."
        />
      </Reveal>

      <Reveal delay={0.04}>
        <AskInvoicePilot suggestions={SUGGESTED_QUESTIONS} answers={answers} />
      </Reveal>

      <Reveal delay={0.08}>
        <p className="text-muted-foreground flex items-start gap-2 text-caption">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          InvoicePilot can read your invoices, customers and payments. It never
          sends a message, records a payment or changes an invoice without your
          explicit confirmation.
        </p>
      </Reveal>
    </div>
  );
}
