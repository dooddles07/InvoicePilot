import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { LinkButton } from "@/components/invoicepilot/link-button";

export default function AppNotFound() {
  return (
    <div className="mx-auto flex min-h-[60svh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
        <FileQuestion className="size-5" aria-hidden />
      </span>

      <div className="space-y-1.5">
        <h1 className="text-h2 font-semibold tracking-tight">
          We couldn&rsquo;t find that
        </h1>
        <p className="text-muted-foreground text-small">
          The invoice, customer or automation you followed a link to is no longer
          here. It may have been voided, merged, or belong to another workspace.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <LinkButton size="sm" href="/dashboard">
          Back to overview
        </LinkButton>
        <LinkButton size="sm" variant="outline" href="/invoices">
          Search invoices
        </LinkButton>
      </div>

      <p className="text-muted-foreground text-caption">
        If you expected to see something here, check you are in the right
        workspace using the switcher at the top of the sidebar.
      </p>
    </div>
  );
}
