"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The error boundary UI.
 *
 * It says what failed, offers the two things that actually help (retry, and a
 * way out), and shows the digest — the one piece of information support can
 * use to find the trace. It never shows the raw error message: on a financial
 * tool that string can carry a customer name, an amount, or a query fragment.
 */
export function ErrorState({
  error,
  reset,
  title = "Something went wrong",
  description = "This screen failed to load. Nothing was changed, and no message was sent to a customer.",
  homeHref = "/dashboard",
  homeLabel = "Back to overview",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
  homeHref?: string;
  homeLabel?: string;
}) {
  useEffect(() => {
    // In production this is where the error goes to the reporter. Logging it
    // here keeps it visible in development without a console.error in render.
    if (process.env.NODE_ENV !== "production") {
      console.error(error);
    }
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60svh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="bg-danger-muted text-danger flex size-12 items-center justify-center rounded-full">
        <TriangleAlert className="size-5" aria-hidden />
      </span>

      <div className="space-y-1.5">
        <h1 className="text-h2 font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-small">{description}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" onClick={reset}>
          <RefreshCw className="size-3.5" />
          Try again
        </Button>
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href={homeHref} />}
        >
          {homeLabel}
        </Button>
      </div>

      {error.digest ? (
        <p className="text-muted-foreground text-caption">
          Reference{" "}
          <code className="bg-muted rounded px-1 font-mono">{error.digest}</code>{" "}
          — quote this to support and they can find the exact trace.
        </p>
      ) : null}
    </div>
  );
}
