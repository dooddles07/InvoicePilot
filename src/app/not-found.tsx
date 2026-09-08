import Link from "next/link";
import { Compass } from "lucide-react";

import { LinkButton } from "@/components/invoicepilot/link-button";
import { Logo } from "@/components/invoicepilot/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col">
      <div className="p-4">
        <Link href="/" aria-label="InvoicePilot home">
          <Logo />
        </Link>
      </div>

      <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 pb-16 text-center">
        <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <Compass className="size-5" aria-hidden />
        </span>

        <div className="space-y-1.5">
          <h1 className="text-h1 font-semibold tracking-tight">
            That page doesn&rsquo;t exist
          </h1>
          <p className="text-muted-foreground text-small">
            The link may be out of date, or the page may have moved.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <LinkButton size="sm" href="/">
            Back to the home page
          </LinkButton>
          <LinkButton size="sm" variant="outline" href="/dashboard">
            Open the demo workspace
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
