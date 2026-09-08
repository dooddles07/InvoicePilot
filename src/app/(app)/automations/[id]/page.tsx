import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AutomationBuilder } from "@/components/automations/automation-builder";
import { Reveal } from "@/components/motion/reveal";
import { automations, getAutomation } from "@/lib/data";

export async function generateStaticParams() {
  return automations.map((a) => ({ id: a.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: getAutomation(id)?.name ?? "Automation" };
}

export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const automation = getAutomation(id);
  if (!automation) notFound();

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
        <AutomationBuilder automation={automation} />
      </Reveal>
    </div>
  );
}
