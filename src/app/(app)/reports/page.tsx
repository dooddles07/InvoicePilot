import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Download, FileText } from "lucide-react";

import { LinkButton } from "@/components/invoicepilot/link-button";
import { PageHeader } from "@/components/invoicepilot/page-header";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { reportDefinitions } from "@/lib/data";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Reveal>
        <PageHeader
          title="Reports"
          description="Seven views of the same ledger. Each one answers a question a finance manager actually asks."
          actions={
            <Button variant="outline" size="sm">
              <CalendarClock className="size-3.5" />
              Scheduled reports
            </Button>
          }
        />
      </Reveal>

      <Stagger className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {reportDefinitions.map((report) => (
          <StaggerItem key={report.id}>
            <article className="bg-card shadow-e1 flex h-full flex-col rounded-xl border">
              <div className="flex-1 space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="bg-brand-muted text-brand flex size-8 shrink-0 items-center justify-center rounded-lg">
                    <FileText className="size-4" aria-hidden />
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    {report.cadence}
                  </Badge>
                </div>

                <h2 className="text-h3 font-semibold tracking-tight">
                  {report.id === "aging" ? (
                    <Link href="/reports/aging" className="hover:underline">
                      {report.name}
                    </Link>
                  ) : (
                    report.name
                  )}
                </h2>

                {/* The question comes first: a report nobody can name the use
                    for is a report nobody opens twice. */}
                <p className="text-brand text-caption font-medium">
                  &ldquo;{report.question}&rdquo;
                </p>
                <p className="text-muted-foreground text-caption">
                  {report.description}
                </p>
              </div>

              <footer className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
                {report.id === "aging" ? (
                  <LinkButton size="sm" variant="outline" href="/reports/aging">
                    Open report
                  </LinkButton>
                ) : (
                  <Button size="sm" variant="outline" disabled>
                    Open report
                  </Button>
                )}
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="xs" aria-label={`Export ${report.name} as CSV`}>
                    <Download className="size-3" />
                    CSV
                  </Button>
                  <Button variant="ghost" size="xs" aria-label={`Export ${report.name} as PDF`}>
                    <Download className="size-3" />
                    PDF
                  </Button>
                </div>
              </footer>
            </article>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
