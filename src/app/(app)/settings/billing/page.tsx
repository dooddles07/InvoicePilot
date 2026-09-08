import type { Metadata } from "next";
import { Check, CreditCard, Download } from "lucide-react";

import { SettingsCard } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getUsage, workspace } from "@/lib/data";
import { formatDate, percent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing" };

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "$29",
    blurb: "One person chasing a small book.",
    limits: ["500 invoices", "100 customers", "5 automations"],
  },
  {
    id: "professional",
    name: "Professional",
    price: "$99",
    blurb: "A finance team with a real collections process.",
    limits: ["5,000 invoices", "1,000 customers", "50 automations"],
  },
  {
    id: "scale",
    name: "Scale",
    price: "$299",
    blurb: "Multiple entities, custom terms, priority support.",
    limits: ["Unlimited invoices", "Unlimited customers", "Unlimited automations"],
  },
] as const;

const INVOICES = [
  { id: "IP-2026-0009", period: "Sep 2026", amount: "$99.00", status: "Paid" },
  { id: "IP-2026-0008", period: "Aug 2026", amount: "$99.00", status: "Paid" },
  { id: "IP-2026-0007", period: "Jul 2026", amount: "$99.00", status: "Paid" },
];

export default function BillingPage() {
  const usage = getUsage();

  return (
    <div className="space-y-3">
      <SettingsCard
        title="Current plan"
        description="Billed monthly. Changing plan takes effect immediately and is prorated."
        footer={
          <>
            <Button variant="outline" size="sm">
              <CreditCard className="size-3.5" />
              Manage billing
            </Button>
            <Button size="sm">Upgrade plan</Button>
          </>
        }
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-h2 font-semibold tracking-tight">Professional</p>
            <p className="text-muted-foreground text-caption">
              Renews {formatDate("2026-10-01T00:00:00.000Z")} · Visa ending 4471
            </p>
          </div>
          <p className="figure text-h1 font-semibold">
            $99
            <span className="text-muted-foreground text-body font-normal">
              /month
            </span>
          </p>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Usage this period"
        description="Limits reset on the first of each month."
      >
        <ul className="space-y-3">
          {usage.map((meter) => {
            const pct = (meter.used / meter.limit) * 100;
            const tight = pct >= 80;
            return (
              <li key={meter.label} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-small font-medium">{meter.label}</span>
                  <span className="tnum text-muted-foreground text-caption">
                    <span
                      className={cn(
                        "text-foreground font-medium",
                        tight && "text-warning",
                      )}
                    >
                      {meter.used.toLocaleString()}
                    </span>{" "}
                    / {meter.limit.toLocaleString()} ({percent(pct, 0)})
                  </span>
                </div>
                <Progress
                  value={Math.min(pct, 100)}
                  aria-label={`${meter.label}: ${meter.used} of ${meter.limit} used`}
                />
              </li>
            );
          })}
        </ul>
      </SettingsCard>

      <SettingsCard
        title="Plans"
        description="Every plan includes automations, AI insights and unlimited team members."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PLANS.map((plan) => {
            const current = plan.id === workspace.plan;
            return (
              <div
                key={plan.id}
                className={cn(
                  "rounded-xl border p-3",
                  current ? "border-brand ring-brand/20 ring-2" : "border-border",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-small font-semibold">{plan.name}</p>
                  {current ? (
                    <span className="bg-brand-muted text-brand rounded-full px-2 py-0.5 text-caption font-medium">
                      Current
                    </span>
                  ) : null}
                </div>
                <p className="figure mt-1 text-h2 font-semibold">
                  {plan.price}
                  <span className="text-muted-foreground text-caption font-normal">
                    /mo
                  </span>
                </p>
                <p className="text-muted-foreground mt-1 text-caption">
                  {plan.blurb}
                </p>
                <ul className="mt-2 space-y-1">
                  {plan.limits.map((limit) => (
                    <li
                      key={limit}
                      className="text-muted-foreground flex items-center gap-1.5 text-caption"
                    >
                      <Check className="text-success size-3 shrink-0" aria-hidden />
                      {limit}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard title="Billing history">
        <ul className="divide-y">
          {INVOICES.map((invoice) => (
            <li
              key={invoice.id}
              className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="font-mono text-caption">{invoice.id}</span>
              <span className="text-muted-foreground text-caption">
                {invoice.period}
              </span>
              <span className="bg-success-muted text-success ml-auto rounded-full px-2 py-0.5 text-caption font-medium">
                {invoice.status}
              </span>
              <span className="tnum w-16 text-right text-small font-medium">
                {invoice.amount}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Download ${invoice.id}`}
              >
                <Download className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </SettingsCard>
    </div>
  );
}
