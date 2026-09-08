import type { Metadata } from "next";

import { IntegrationCard } from "@/components/integrations/integration-card";
import { PageHeader } from "@/components/invoicepilot/page-header";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";
import { integrations } from "@/lib/data";
import type { IntegrationCategory } from "@/types";

export const metadata: Metadata = { title: "Integrations" };

const CATEGORIES: { key: IntegrationCategory; label: string; blurb: string }[] = [
  {
    key: "accounting",
    label: "Accounting",
    blurb: "Keep your ledger and InvoicePilot in step, both directions.",
  },
  {
    key: "payments",
    label: "Payments",
    blurb: "Reconcile settlements against open invoices automatically.",
  },
  {
    key: "communication",
    label: "Communication",
    blurb: "Send reminders from your own address, and track the replies.",
  },
  {
    key: "ecommerce",
    label: "Ecommerce",
    blurb: "Pull wholesale and B2B orders in as invoices.",
  },
  {
    key: "automation",
    label: "Automation",
    blurb: "Push collection events into the rest of your stack.",
  },
];

export default function IntegrationsPage() {
  const connected = integrations.filter((i) => i.status === "connected").length;
  const failing = integrations.filter((i) => i.status === "error").length;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <Reveal>
        <PageHeader
          title="Integrations"
          description={
            <>
              {connected} connected
              {failing > 0 ? (
                <>
                  {" · "}
                  <span className="text-danger font-medium">
                    {failing} need attention
                  </span>
                </>
              ) : null}
            </>
          }
        />
      </Reveal>

      {CATEGORIES.map((category, index) => {
        const items = integrations.filter((i) => i.category === category.key);
        if (items.length === 0) return null;

        return (
          <Reveal key={category.key} delay={0.04 + index * 0.03}>
            <section aria-labelledby={`${category.key}-heading`}>
              <div className="mb-2">
                <h2
                  id={`${category.key}-heading`}
                  className="text-h3 font-semibold tracking-tight"
                >
                  {category.label}
                </h2>
                <p className="text-muted-foreground text-caption">
                  {category.blurb}
                </p>
              </div>

              <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((integration) => (
                  <StaggerItem key={integration.id}>
                    <IntegrationCard integration={integration} />
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
          </Reveal>
        );
      })}
    </div>
  );
}
