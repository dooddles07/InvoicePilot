import type { Metadata } from "next";
import { AlertTriangle, Plus, Webhook } from "lucide-react";

import { SettingsCard } from "@/components/settings/settings-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { webhookEndpoints } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Webhooks" };

const STATUS_TONE = {
  active: "bg-success-muted text-success",
  failing: "bg-danger-muted text-danger",
  paused: "bg-muted text-muted-foreground",
} as const;

export default function WebhooksPage() {
  return (
    <div className="space-y-3">
      <SettingsCard
        title="Webhook endpoints"
        description="Collection events posted to your own systems as they happen."
        footer={
          <Button size="sm">
            <Plus className="size-3.5" />
            Add endpoint
          </Button>
        }
      >
        <ul className="divide-y">
          {webhookEndpoints.map((hook) => (
            <li key={hook.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <Webhook
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden
                />
                <code className="min-w-0 flex-1 truncate font-mono text-caption">
                  {hook.url}
                </code>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-caption font-medium",
                    STATUS_TONE[hook.status],
                  )}
                >
                  {hook.status}
                </span>
              </div>

              <div className="flex flex-wrap gap-1">
                {hook.events.map((event) => (
                  <Badge key={event} variant="outline" className="font-mono">
                    {event}
                  </Badge>
                ))}
              </div>

              {hook.status === "failing" ? (
                <p className="text-danger flex items-center gap-1.5 text-caption">
                  <AlertTriangle className="size-3 shrink-0" aria-hidden />
                  {hook.failure_count} consecutive failures. Deliveries retry with
                  backoff for 24 hours, then stop.
                </p>
              ) : (
                <p className="text-muted-foreground text-caption">
                  Last delivery{" "}
                  {hook.last_delivery_at
                    ? formatDate(hook.last_delivery_at)
                    : "never"}
                </p>
              )}
            </li>
          ))}
        </ul>
      </SettingsCard>

      <SettingsCard
        title="Verifying deliveries"
        description="Every request is signed so you can prove it came from InvoicePilot."
      >
        <p className="text-small">
          Each delivery carries an{" "}
          <code className="bg-muted rounded px-1 font-mono text-caption">
            X-InvoicePilot-Signature
          </code>{" "}
          header: an HMAC-SHA256 of the raw request body, keyed with your
          endpoint secret.
        </p>
        <p className="text-muted-foreground mt-2 text-caption">
          Compare it against the raw body before parsing, and use a constant-time
          comparison. Reject anything whose timestamp is more than five minutes
          old — that is what stops a captured request being replayed at you later.
        </p>
      </SettingsCard>
    </div>
  );
}
