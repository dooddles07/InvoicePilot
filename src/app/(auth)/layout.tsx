import Link from "next/link";
import { Quote, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/invoicepilot/logo";
import { PROOF_STATS, TESTIMONIALS } from "@/lib/marketing";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const testimonial = TESTIMONIALS[0];

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col">
        <div className="p-4">
          <Link href="/" aria-label="InvoicePilot home">
            <Logo />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>

      {/* Reassurance panel, not decoration: the objection at signup is "is this
          worth my time and safe with my ledger", so this side answers it. */}
      <aside className="bg-muted/40 hidden flex-col justify-between border-l p-8 lg:flex">
        <figure className="my-auto max-w-md space-y-4">
          <Quote className="text-brand/40 size-8" aria-hidden />
          <blockquote className="text-h2 font-medium tracking-tight text-balance">
            {testimonial.quote}
          </blockquote>
          <figcaption className="text-muted-foreground text-small">
            <span className="text-foreground block font-medium">
              {testimonial.name}
            </span>
            {testimonial.role}, {testimonial.company}
          </figcaption>
        </figure>

        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-4">
            {PROOF_STATS.slice(0, 4).map((stat) => (
              <div key={stat.label}>
                <dd className="figure text-h2 font-semibold">{stat.value}</dd>
                <dt className="text-muted-foreground text-caption">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>

          <p className="text-muted-foreground flex items-start gap-2 text-caption">
            <ShieldCheck className="text-success mt-0.5 size-3.5 shrink-0" aria-hidden />
            Encrypted in transit and at rest. Every action that touches a record
            or contacts a customer is written to an exportable audit log.
          </p>
        </div>
      </aside>
    </div>
  );
}
