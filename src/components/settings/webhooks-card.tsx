"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Check, Copy, Plus, Send, Webhook } from "lucide-react";
import { toast } from "sonner";

import { createWebhook, removeWebhook, sendTestWebhook } from "@/lib/actions/webhooks";
import { SettingsCard } from "@/components/settings/settings-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { WEBHOOK_EVENTS, type WebhookEndpoint } from "@/types";

const STATUS_TONE = {
  active: "bg-success-muted text-success",
  failing: "bg-danger-muted text-danger",
  paused: "bg-muted text-muted-foreground",
} as const;

export function WebhooksCard({ endpoints }: { endpoints: WebhookEndpoint[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<(WebhookEndpoint & { secret: string }) | null>(null);

  const toggleEvent = (event: string, checked: boolean) => {
    setEvents((prev) => (checked ? [...prev, event] : prev.filter((e) => e !== event)));
  };

  const submit = () => {
    startTransition(async () => {
      const result = await createWebhook({ url, events });
      if (!result.ok) {
        toast.error("Could not add the endpoint", { description: result.message });
        return;
      }
      setCreateOpen(false);
      setUrl("");
      setEvents([]);
      setRevealed(result.endpoint);
      router.refresh();
    });
  };

  const remove = (endpointId: string) => {
    startTransition(async () => {
      const result = await removeWebhook(endpointId);
      if (!result.ok) {
        toast.error("Could not remove the endpoint", { description: result.message });
        return;
      }
      toast.success("Endpoint removed");
      router.refresh();
    });
  };

  const sendTest = (endpointId: string) => {
    startTransition(async () => {
      const result = await sendTestWebhook(endpointId);
      if (!result.ok) {
        toast.error("Could not send the test event", { description: result.message });
        return;
      }
      if (result.delivered) {
        toast.success("Test event delivered", { description: `Responded ${result.responseStatus}.` });
      } else {
        toast.error("Test event failed", {
          description: result.responseStatus
            ? `Endpoint responded ${result.responseStatus}.`
            : "The endpoint did not respond.",
        });
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <SettingsCard
        title="Webhook endpoints"
        description="Collection events posted to your own systems as they happen."
        footer={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger
              render={
                <Button size="sm">
                  <Plus className="size-3.5" />
                  Add endpoint
                </Button>
              }
            />
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add a webhook endpoint</DialogTitle>
                <DialogDescription>
                  The signing secret is shown once, right after you add it.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="webhook-url">URL</Label>
                  <Input
                    id="webhook-url"
                    placeholder="https://example.com/webhooks/invoicepilot"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Events</Label>
                  <div className="flex flex-col gap-2">
                    {WEBHOOK_EVENTS.map((event) => (
                      <label key={event} className="flex items-center gap-2 text-small">
                        <Checkbox
                          checked={events.includes(event)}
                          onCheckedChange={(v) => toggleEvent(event, v === true)}
                        />
                        <code className="font-mono text-caption">{event}</code>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={pending || !url.trim() || events.length === 0}
                  onClick={submit}
                >
                  {pending ? "Adding…" : "Add endpoint"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      >
        {endpoints.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-small">
            No webhook endpoints yet. Add one to receive collection events as they happen.
          </p>
        ) : (
          <ul className="divide-y">
            {endpoints.map((hook) => (
              <li key={hook.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Webhook className="text-muted-foreground size-4 shrink-0" aria-hidden />
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

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {hook.events.map((event) => (
                      <Badge key={event} variant="outline" className="font-mono">
                        {event}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => sendTest(hook.id)}
                    >
                      <Send className="size-3.5" />
                      Send test
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      disabled={pending}
                      onClick={() => remove(hook.id)}
                    >
                      Remove
                    </Button>
                  </div>
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
                    {hook.last_delivery_at ? formatDate(hook.last_delivery_at) : "never"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
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

      <Dialog open={!!revealed} onOpenChange={(open) => !open && setRevealed(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Endpoint added</DialogTitle>
            <DialogDescription>
              Copy the signing secret now — it will not be shown again.
            </DialogDescription>
          </DialogHeader>
          {revealed ? <RevealedSecret value={revealed.secret} /> : null}
          <DialogFooter>
            <Button size="sm" onClick={() => setRevealed(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RevealedSecret({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select and copy the secret manually.");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <code className="bg-muted min-w-0 flex-1 overflow-x-auto rounded px-2 py-1.5 font-mono text-caption">
        {value}
      </code>
      <Button type="button" variant="outline" size="sm" onClick={copy}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
