import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus, Workflow } from "lucide-react";

import { FlowCanvas } from "@/components/automations/flow-canvas";
import { LinkButton } from "@/components/invoicepilot/link-button";
import { PageHeader } from "@/components/invoicepilot/page-header";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { automations, automationTemplates } from "@/lib/data";
import { formatDate, money } from "@/lib/format";

export const metadata: Metadata = { title: "Automation" };

export default function AutomationsPage() {
  const recovered = automations.reduce((s, a) => s + a.recovered_cents_30d, 0);
  const runs = automations.reduce((s, a) => s + a.runs_30d, 0);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Reveal>
        <PageHeader
          title="Collection automations"
          description={
            <>
              {runs} runs in the last 30 days recovered{" "}
              <span className="tnum text-success font-medium">
                {money(recovered)}
              </span>{" "}
              without anyone chasing it by hand.
            </>
          }
          actions={
            <LinkButton size="sm" href="/automations/new">
              <Plus className="size-3.5" />
              Create automation
            </LinkButton>
          }
        />
      </Reveal>

      <Stagger className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {automations.map((automation) => (
          <StaggerItem key={automation.id}>
            <article className="bg-card shadow-e1 flex h-full flex-col rounded-xl border">
              <header className="flex items-start justify-between gap-3 border-b p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-h3 font-semibold tracking-tight">
                      <Link
                        href={`/automations/${automation.id}`}
                        className="hover:underline"
                      >
                        {automation.name}
                      </Link>
                    </h2>
                    <Badge
                      className={
                        automation.enabled
                          ? "bg-success-muted text-success"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {automation.enabled ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-caption">
                    {automation.description}
                  </p>
                </div>
              </header>

              <dl className="grid grid-cols-3 gap-px border-b">
                <Stat label="Trigger" value={automation.trigger_label} wide />
                <Stat label="Runs (30d)" value={String(automation.runs_30d)} />
                <Stat
                  label="Recovered"
                  value={money(automation.recovered_cents_30d)}
                />
              </dl>

              <div className="bg-muted/20 flex-1 p-4">
                {/* A compact preview of the real sequence, not an illustration:
                    what you see here is what runs. */}
                <FlowCanvas nodes={automation.nodes.slice(0, 3)} compact />
                {automation.nodes.length > 3 ? (
                  <p className="text-muted-foreground mt-2 text-center text-caption">
                    + {automation.nodes.length - 3} more steps
                  </p>
                ) : null}
              </div>

              <footer className="flex items-center justify-between gap-3 border-t px-4 py-2.5">
                <p className="text-muted-foreground text-caption">
                  {automation.last_run_at
                    ? `Last run ${formatDate(automation.last_run_at)}`
                    : "Never run"}
                </p>
                <LinkButton
                  size="sm"
                  variant="outline"
                  href={`/automations/${automation.id}`}
                >
                  Open builder
                  <ArrowRight className="size-3.5" />
                </LinkButton>
              </footer>
            </article>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal delay={0.06}>
        <section
          aria-labelledby="templates-heading"
          className="bg-card shadow-e1 rounded-xl border"
        >
          <header className="flex items-center gap-2 border-b p-4">
            <Workflow className="text-brand size-4" aria-hidden />
            <div>
              <h2
                id="templates-heading"
                className="text-h3 font-semibold tracking-tight"
              >
                Start from a template
              </h2>
              <p className="text-muted-foreground text-caption">
                Sequences that already work. Edit anything after you add it.
              </p>
            </div>
          </header>

          <ul className="divide-y">
            {automationTemplates.map((template) => (
              <li
                key={template.id}
                className="hover:bg-muted/30 flex flex-col gap-2 p-4 transition-colors sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-small font-medium">{template.name}</p>
                  <p className="text-muted-foreground text-caption">
                    {template.description}
                  </p>
                  <p className="text-muted-foreground text-caption">
                    Trigger: {template.trigger_label} · {template.nodes.length}{" "}
                    steps
                  </p>
                </div>
                <LinkButton
                  size="sm"
                  variant="outline"
                  href={`/automations/new?template=${template.id}`}
                >
                  Use template
                </LinkButton>
              </li>
            ))}
          </ul>
        </section>
      </Reveal>
    </div>
  );
}

function Stat({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "px-4 py-2.5" : "px-4 py-2.5"}>
      <dt className="text-muted-foreground text-caption">{label}</dt>
      <dd className="truncate text-small font-medium">{value}</dd>
    </div>
  );
}
