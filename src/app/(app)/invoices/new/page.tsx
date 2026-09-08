import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { NewInvoiceForm } from "@/components/invoices/new-invoice-form";
import { Reveal } from "@/components/motion/reveal";
import { customers } from "@/lib/data";
import { NOW } from "@/lib/data";

export const metadata: Metadata = { title: "New invoice" };

export default function NewInvoicePage() {
  const options = customers
    .map((c) => ({
      id: c.id,
      name: c.name,
      terms: c.payment_terms_days,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Reveal className="space-y-3">
        <Link
          href="/invoices"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-caption"
        >
          <ArrowLeft className="size-3" />
          All invoices
        </Link>
        <div>
          <h1 className="text-h1 font-semibold tracking-tight">New invoice</h1>
          <p className="text-muted-foreground text-small">
            The due date follows the customer&rsquo;s agreed terms, so the
            collection sequence starts from the right day.
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.04}>
        <NewInvoiceForm
          customers={options}
          today={NOW.toISOString().slice(0, 10)}
        />
      </Reveal>
    </div>
  );
}
