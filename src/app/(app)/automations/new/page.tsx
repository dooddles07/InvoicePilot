import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AutomationBuilder } from "@/components/automations/automation-builder";
import { Reveal } from "@/components/motion/reveal";
import { automationTemplates, NOW, workspace } from "@/lib/data";
import type { Automation } from "@/types";

export const metadata: Metadata = { title: "New automation" };

const BLANK: Automation = {
  id: "aut_new",
  workspace_id: workspace.id,
  name: "Untitled automation",
  description: "",
  enabled: false,
  trigger_label: "Invoice becomes overdue",
  nodes: [
    {
      id: "nd_new_trigger",
      type: "trigger",
      title: "Invoice becomes overdue",
      detail: "Any invoice, any amount",
    },
  ],
  runs_30d: 0,
  recovered_cents_30d: 0,
  last_run_at: null,
  created_at: NOW.toISOString(),
};

export default async function NewAutomationPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { template: templateId } = await searchParams;
  const template = automationTemplates.find((t) => t.id === templateId);

  // A template is a starting point, not a preset: it seeds a normal draft that
  // the builder edits like any other.
  const automation: Automation = template
    ? {
        ...BLANK,
        name: template.name,
        description: template.description,
        trigger_label: template.trigger_label,
        nodes: template.nodes,
      }
    : BLANK;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Reveal className="space-y-2">
        <Link
          href="/automations"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-caption"
        >
          <ArrowLeft className="size-3" />
          All automations
        </Link>
        <h1 className="text-h1 font-semibold tracking-tight">
          {template ? `New: ${template.name}` : "New automation"}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-small">
          {template
            ? template.description
            : "Start from the trigger and add the steps that follow. Nothing runs until you activate it."}
        </p>
      </Reveal>

      <Reveal delay={0.04}>
        <AutomationBuilder key={templateId ?? "blank"} automation={automation} />
      </Reveal>
    </div>
  );
}
