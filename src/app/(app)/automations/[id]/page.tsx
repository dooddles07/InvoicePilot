import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AutomationBuilder } from "@/components/automations/automation-builder";
import { Reveal } from "@/components/motion/reveal";
import { handleReadError } from "@/lib/api/client";
import { getAutomation } from "@/lib/api/automations";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const automation = await getAutomation(id).catch(() => null);
  return { title: automation?.name ?? "Automation" };
}

export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const automation = await getAutomation(id).catch(handleReadError);

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
        <p className="text-muted-foreground max-w-2xl text-small">
          {automation.description}
        </p>
      </Reveal>

      <Reveal delay={0.04}>
        <AutomationBuilder automation={automation} isNew={false} />
      </Reveal>
    </div>
  );
}
