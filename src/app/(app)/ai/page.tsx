import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { AskInvoicePilot } from "@/components/ai/ask-invoicepilot";
import { PageHeader } from "@/components/invoicepilot/page-header";
import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = { title: "Ask InvoicePilot" };

// The four ready-made prompts. Not fixture data -- POST /ai/ask answers any
// question, real-time, against the ledger; these just give an empty box
// something to click.
const SUGGESTED_QUESTIONS = [
  "Why did our overdue balance increase?",
  "Which customers are most likely to pay late?",
  "How much did we collect this month?",
  "Which invoices should I prioritise?",
] as const;

export default function AskPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Reveal>
        <PageHeader
          title="Ask InvoicePilot"
          description="Questions about your receivables, answered from your own ledger."
        />
      </Reveal>

      <Reveal delay={0.04}>
        <AskInvoicePilot suggestions={SUGGESTED_QUESTIONS} />
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
