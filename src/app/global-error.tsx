"use client";

import { ErrorState } from "@/components/invoicepilot/error-state";

/**
 * The last-resort boundary: it replaces the root layout, so it has to ship its
 * own html and body. Only reached when the root layout itself failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <ErrorState
          error={error}
          reset={reset}
          title="InvoicePilot failed to start"
          description="Something went wrong before the app could load. Nothing was changed, and no message was sent to a customer."
          homeHref="/"
          homeLabel="Back to the home page"
        />
      </body>
    </html>
  );
}
