import type { Metadata } from "next";
import { KeyRound, Plus, ShieldAlert } from "lucide-react";

import { SettingsCard } from "@/components/settings/settings-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiKeys } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "API keys" };

export default function ApiKeysPage() {
  return (
    <div className="space-y-3">
      <SettingsCard
        title="API keys"
        description="Server-side access to your workspace data."
        footer={
          <Button size="sm">
            <Plus className="size-3.5" />
            Create key
          </Button>
        }
      >
        <ul className="divide-y">
          {apiKeys.map((key) => (
            <li
              key={key.id}
              className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <span
                aria-hidden
                className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg"
              >
                <KeyRound className="size-4" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-small font-medium">{key.name}</p>
                {/* Only the last four characters exist client-side — the key
                    itself is shown once, at creation, and never again. */}
                <p className="text-muted-foreground font-mono text-caption">
                  ip_live_••••••••••••{key.last_four}
                </p>
              </div>

              <div className="flex gap-1">
                {key.scopes.map((scope) => (
                  <Badge key={scope} variant="outline">
                    {scope}
                  </Badge>
                ))}
              </div>

              <span className="text-muted-foreground w-32 text-right text-caption">
                {key.last_used_at
                  ? `Used ${formatDate(key.last_used_at)}`
                  : "Never used"}
              </span>

              <Button variant="ghost" size="sm" className="text-danger">
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      </SettingsCard>

      <div className="border-warning/30 bg-warning-muted/40 flex gap-2.5 rounded-xl border p-3">
        <ShieldAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="space-y-1">
          <p className="text-small font-medium">Keys are shown once</p>
          <p className="text-muted-foreground text-caption">
            The full key is displayed at creation and never stored in a form we
            can read back. Use a server-side secret store, never a bundled
            environment variable in the browser — a key with write scope can
            issue invoices and record payments.
          </p>
        </div>
      </div>
    </div>
  );
}
