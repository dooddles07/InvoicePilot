"use client";

import { useState } from "react";
import { ArrowRight, Check, Minus, ShieldCheck } from "lucide-react";

import { LinkButton } from "@/components/invoicepilot/link-button";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import {
  ANNUAL_DISCOUNT_PERCENT,
  COMPARISON,
  GUARANTEE,
  PLANS,
  type CellValue,
} from "@/lib/marketing";
import { cn } from "@/lib/utils";

/**
 * Plan cards plus a grouped comparison table.
 *
 * Prices render as text, never as an image and never behind "contact us" for
 * the two self-serve tiers: buyers increasingly ask an assistant what a tool
 * costs before they ever load the page, and a price an agent cannot read is a
 * shortlist you never appear on.
 */
export function PricingPlans({ compact = false }: { compact?: boolean }) {
  const [annual, setAnnual] = useState(true);

  return (
    <div className="space-y-8">
      <Reveal className="flex flex-col items-center gap-3">
        <div
          role="group"
          aria-label="Billing period"
          className="bg-muted inline-flex rounded-lg p-0.5"
        >
          {(
            [
              ["Monthly", false],
              [`Annual — save ${ANNUAL_DISCOUNT_PERCENT}%`, true],
            ] as const
          ).map(([label, value]) => (
            <Button
              key={label}
              size="sm"
              variant="ghost"
              aria-pressed={annual === value}
              onClick={() => setAnnual(value)}
              className={cn(
                "rounded-[7px]",
                annual === value && "bg-card text-foreground shadow-e1 hover:bg-card",
              )}
            >
              {label}
            </Button>
          ))}
        </div>
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan, i) => (
          <Reveal key={plan.id} delay={0.04 * i}>
            <article
              className={cn(
                "bg-card shadow-e1 relative flex h-full flex-col rounded-xl border p-5",
                plan.recommended && "border-brand ring-brand/20 shadow-e2 ring-2",
              )}
            >
              {plan.recommended ? (
                <span className="bg-brand text-brand-foreground absolute -top-2.5 left-5 rounded-full px-2.5 py-0.5 text-caption font-medium">
                  Most popular
                </span>
              ) : null}

              <h3 className="text-h3 font-semibold tracking-tight">{plan.name}</h3>
              <p className="text-muted-foreground text-caption">{plan.audience}</p>

              <p className="mt-3 flex items-baseline gap-1">
                <span className="figure text-display leading-none font-semibold">
                  ${annual ? plan.annual : plan.monthly}
                </span>
                <span className="text-muted-foreground text-small">/month</span>
              </p>
              <p className="text-muted-foreground mt-1 text-caption">
                {annual
                  ? `billed annually · $${plan.monthly}/month if billed monthly`
                  : "billed monthly · cancel any time"}
              </p>

              <p className="mt-3 text-small">{plan.blurb}</p>

              <ul className="mt-4 flex-1 space-y-1.5">
                {plan.highlights.map((point) => (
                  <li key={point} className="flex gap-2 text-small">
                    <Check className="text-success mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>

              <dl className="text-muted-foreground mt-4 space-y-0.5 border-t pt-3 text-caption">
                {Object.values(plan.limits).map((limit) => (
                  <dd key={limit}>{limit}</dd>
                ))}
              </dl>

              <LinkButton
                className="mt-4 w-full"
                variant={plan.recommended ? "default" : "outline"}
                href={plan.id === "scale" ? "/signup?plan=scale" : "/signup"}
              >
                {plan.cta}
                <ArrowRight className="size-3.5" />
              </LinkButton>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <div className="border-success/30 bg-success-muted/40 flex gap-3 rounded-xl border p-4">
          <ShieldCheck className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="text-small font-semibold">{GUARANTEE.headline}</p>
            <p className="text-muted-foreground mt-0.5 text-small">
              {GUARANTEE.body}
            </p>
          </div>
        </div>
      </Reveal>

      {!compact ? <ComparisonTable annual={annual} /> : null}
    </div>
  );
}

function Cell({ value, highlighted }: { value: CellValue; highlighted: boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <span
        className={cn(
          "mx-auto flex size-5 items-center justify-center rounded-full",
          highlighted ? "bg-brand text-brand-foreground" : "bg-success-muted text-success",
        )}
      >
        <Check className="size-3" aria-hidden />
        <span className="sr-only">Included</span>
      </span>
    ) : (
      <span className="bg-muted text-muted-foreground mx-auto flex size-5 items-center justify-center rounded-full">
        <Minus className="size-3" aria-hidden />
        <span className="sr-only">Not included</span>
      </span>
    );
  }
  return <span className="text-small font-medium">{value}</span>;
}

function ComparisonTable({ annual }: { annual: boolean }) {
  return (
    <Reveal>
      <section aria-labelledby="compare-heading" className="space-y-3">
        <h2 id="compare-heading" className="text-h2 font-semibold tracking-tight">
          Compare every plan
        </h2>

        <div className="bg-card shadow-e1 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[640px] table-fixed">
            <caption className="sr-only">
              InvoicePilot plan comparison by feature
            </caption>
            <thead>
              <tr>
                <th scope="col" className="w-[34%] px-4 pt-4 pb-3 text-left align-bottom">
                  <span className="text-muted-foreground text-caption font-semibold tracking-wider uppercase">
                    Features
                  </span>
                </th>
                {PLANS.map((plan) => (
                  <th
                    key={plan.id}
                    scope="col"
                    className={cn(
                      "px-3 pt-4 pb-3 text-center align-bottom",
                      plan.recommended && "bg-brand-muted/40",
                    )}
                  >
                    {/* The "most popular" flag lives in the header cell rather
                        than being absolutely positioned over the table, so it
                        stays attached to its column at any width. */}
                    {plan.recommended ? (
                      <span className="bg-brand text-brand-foreground mb-1 inline-block rounded-full px-2 py-0.5 text-caption font-medium">
                        Most popular
                      </span>
                    ) : null}
                    <span className="block text-small font-semibold">{plan.name}</span>
                    <span className="figure block text-h3 font-semibold">
                      ${annual ? plan.annual : plan.monthly}
                    </span>
                    <span className="text-muted-foreground block text-caption font-normal">
                      per month
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {COMPARISON.map((group) => (
                <>
                  <tr key={group.section} className="bg-muted/40">
                    <th
                      scope="colgroup"
                      colSpan={4}
                      className="px-4 py-2 text-left text-caption font-semibold tracking-wider uppercase"
                    >
                      {group.section}
                    </th>
                  </tr>
                  {group.features.map((feature) => (
                    <tr key={`${group.section}-${feature.label}`} className="border-t">
                      <th
                        scope="row"
                        className="px-4 py-2.5 text-left text-small font-normal"
                      >
                        {feature.label}
                      </th>
                      {feature.values.map((value, i) => (
                        <td
                          key={`${feature.label}-${PLANS[i]!.id}`}
                          className={cn(
                            "px-3 py-2.5 text-center",
                            PLANS[i]!.recommended && "bg-brand-muted/40",
                          )}
                        >
                          <Cell value={value} highlighted={!!PLANS[i]!.recommended} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ))}

              <tr className="border-t">
                <td className="px-4 py-4" />
                {PLANS.map((plan) => (
                  <td
                    key={`cta-${plan.id}`}
                    className={cn(
                      "px-3 py-4 text-center",
                      plan.recommended && "bg-brand-muted/40",
                    )}
                  >
                    <LinkButton
                      size="sm"
                      variant={plan.recommended ? "default" : "outline"}
                      className="w-full"
                      href={plan.id === "scale" ? "/signup?plan=scale" : "/signup"}
                    >
                      {plan.cta}
                    </LinkButton>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </Reveal>
  );
}
