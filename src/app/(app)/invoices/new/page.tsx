import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { NewInvoiceForm } from "@/components/invoices/new-invoice-form";
import { Reveal } from "@/components/motion/reveal";
import { handleReadError } from "@/lib/api/client";
import { getCustomers } from "@/lib/api/customers";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  const { data: customers } = await getCustomers({ limit: 500, sort: "name", order: "asc" }).catch(
    handleReadError,
  );
  const options = customers.map((c) => ({
    id: c.id,
    name: c.name,
    terms: c.payment_terms_days,
  }));

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
          today={new Date().toISOString().slice(0, 10)}
        />
      </Reveal>
    </div>
  );
}
