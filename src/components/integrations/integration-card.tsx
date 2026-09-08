"use client";

import { AlertTriangle, Check, Plug, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { Integration } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Wordmark tiles instead of logos: shipping a real provider's mark in a mockup
 * would be trading on their brand, and a two-letter monogram carries the same
 * scanning value in a grid.
 */
const TILE: Record<string, string> = {
  quickbooks: "bg-success-muted text-success",
  xero: "bg-brand-muted text-brand",
  stripe: "bg-brand-muted text-brand",
  paypal: "bg-brand-muted text-brand",
  gmail: "bg-danger-muted text-danger",
  outlook: "bg-brand-muted text-brand",
  twilio: "bg-danger-muted text-danger",
  shopify: "bg-success-muted text-success",
  woocommerce: "bg-brand-muted text-brand",
  zapier: "bg-warning-muted text-warning",
  webhooks: "bg-muted text-foreground",
};

const STATUS = {
  connected: {
    label: "Connected",
    className: "bg-success-muted text-success ring-success/25",
  },
  available: {
    label: "Not connected",
    className: "bg-muted text-muted-foreground ring-border",
  },
  error: {
    label: "Needs attention",
    className: "bg-danger-muted text-danger ring-danger/25",
  },
} as const;

export function IntegrationCard({ integration }: { integration: Integration }) {
  const status = STATUS[integration.status];
  const monogram = integration.name.slice(0, 2).toUpperCase();

  return (
    <article className="bg-card shadow-e1 flex h-full flex-col rounded-xl border">
      <div className="flex-1 space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <span
            aria-hidden
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg text-caption font-bold",
              TILE[integration.id] ?? "bg-muted text-foreground",
            )}
          >
            {monogram}
          </span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-caption font-medium ring-1 ring-inset",
              status.className,
            )}
          >
            {integration.status === "connected" ? (
              <Check className="size-3" aria-hidden />
            ) : integration.status === "error" ? (
              <AlertTriangle className="size-3" aria-hidden />
            ) : (
              <Plug className="size-3" aria-hidden />
            )}
            {status.label}
          </span>
        </div>

        <h3 className="text-h3 font-semibold tracking-tight">{integration.name}</h3>
        <p className="text-muted-foreground text-caption">
          {integration.description}
        </p>

        {integration.status === "error" ? (
          <p className="text-danger text-caption">
            Authentication expired — reconnect to resume sending.
          </p>
        ) : integration.last_synced_at ? (
          <p className="text-muted-foreground text-caption">
            Last synced {formatDate(integration.last_synced_at)}
          </p>
        ) : null}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
        {integration.status === "connected" ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast.success("Sync started", {
                  description: `Pulling the latest from ${integration.name}.`,
                })
              }
            >
              <RefreshCw className="size-3.5" />
              Sync now
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() =>
                toast.warning(`Disconnect ${integration.name}?`, {
                  description:
                    "Data already imported stays. New records will stop syncing.",
                  action: {
                    label: "Disconnect",
                    onClick: () =>
                      toast.success(`${integration.name} disconnected`),
                  },
                })
              }
            >
              Disconnect
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant={integration.status === "error" ? "default" : "outline"}
            onClick={() =>
              toast(`Connect ${integration.name}`, {
                description:
                  "You will be taken to their site to authorise the connection.",
              })
            }
          >
            {integration.status === "error" ? "Reconnect" : "Connect"}
          </Button>
        )}
      </footer>
    </article>
  );
}
