import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, MessageSquare, Sparkles, Workflow } from "lucide-react";

import { LinkButton } from "@/components/invoicepilot/link-button";
import { PageHeader } from "@/components/invoicepilot/page-header";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Help & support" };

const GUIDES = [
  {
    icon: Workflow,
    title: "Set up your first automation",
    body: "Start with the Friendly Payment Reminder template and change one thing: the delay. Most teams find day one is too soon and day five is too late.",
    href: "/automations",
    cta: "Open automations",
  },
  {
    icon: Sparkles,
    title: "How the risk score is calculated",
    body: "On-time rate across the account's full history, the age of its oldest open balance, and how those have moved over the last quarter. Every score names the condition that produced it.",
    href: "/customers",
    cta: "See customers",
  },
  {
    icon: BookOpen,
    title: "What the collection rate measures",
    body: "The share of invoiced value that was settled, measured on a window that has had time to settle. Scoring invoices that only fell due last week reports a failure that is really your payment terms working.",
    href: "/reports",
    cta: "Open reports",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Reveal>
        <PageHeader
          title="Help & support"
          description="Answers to the questions that come up in the first fortnight."
          actions={
            <Button size="sm">
              <MessageSquare className="size-3.5" />
              Contact support
            </Button>
          }
        />
      </Reveal>

      <Stagger className="grid grid-cols-1 gap-3">
        {GUIDES.map((guide) => (
          <StaggerItem key={guide.title}>
            <article className="bg-card shadow-e1 flex gap-3 rounded-xl border p-4">
              <span
                aria-hidden
                className="bg-brand-muted text-brand flex size-8 shrink-0 items-center justify-center rounded-lg"
              >
                <guide.icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <h2 className="text-h3 font-semibold tracking-tight">
                  {guide.title}
                </h2>
                <p className="text-muted-foreground text-small">{guide.body}</p>
                <LinkButton size="sm" variant="outline" href={guide.href}>
                  {guide.cta}
                </LinkButton>
              </div>
            </article>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal delay={0.1}>
        <p className="text-muted-foreground text-caption">
          Still stuck? Support replies within one business day, and faster on the
          Scale plan. Your{" "}
          <Link href="/settings/audit-log" className="text-brand hover:underline">
            audit log
          </Link>{" "}
          is the fastest way to show us what happened.
        </p>
      </Reveal>
    </div>
  );
}
