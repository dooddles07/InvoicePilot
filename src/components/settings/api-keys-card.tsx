"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { createApiKey, revokeApiKey } from "@/lib/actions/apiKeys";
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
import type { ApiKey } from "@/types";

export function ApiKeysCard({ apiKeys }: { apiKeys: ApiKey[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<("read" | "write")[]>(["read"]);
  const [revealed, setRevealed] = useState<(ApiKey & { key: string }) | null>(null);

  const toggleScope = (scope: "read" | "write", checked: boolean) => {
    setScopes((prev) =>
      checked ? [...prev, scope] : prev.filter((s) => s !== scope),
    );
  };

  const submit = () => {
    startTransition(async () => {
      const result = await createApiKey({ name, scopes });
      if (!result.ok) {
        toast.error("Could not create the key", { description: result.message });
        return;
      }
      setCreateOpen(false);
      setName("");
      setScopes(["read"]);
      setRevealed(result.apiKey);
      router.refresh();
    });
  };

  const revoke = (keyId: string, keyName: string) => {
    startTransition(async () => {
      const result = await revokeApiKey(keyId);
      if (!result.ok) {
        toast.error("Could not revoke the key", { description: result.message });
        return;
      }
      toast.success("Key revoked", { description: `${keyName} can no longer authenticate.` });
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <SettingsCard
        title="API keys"
        description="Server-side access to your workspace data."
        footer={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger
              render={
                <Button size="sm">
                  <Plus className="size-3.5" />
                  Create key
                </Button>
              }
            />
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create an API key</DialogTitle>
                <DialogDescription>
                  The full key is shown once, right after you create it.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="key-name">Name</Label>
                  <Input
                    id="key-name"
                    placeholder="CI deploy bot"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Scopes</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-small">
                      <Checkbox
                        checked={scopes.includes("read")}
                        onCheckedChange={(v) => toggleScope("read", v === true)}
                      />
                      Read
                    </label>
                    <label className="flex items-center gap-2 text-small">
                      <Checkbox
                        checked={scopes.includes("write")}
                        onCheckedChange={(v) => toggleScope("write", v === true)}
                      />
                      Write
                    </label>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={pending || !name.trim() || scopes.length === 0}
                  onClick={submit}
                >
                  {pending ? "Creating…" : "Create key"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      >
        {apiKeys.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-small">
            No API keys yet. Create one to access your workspace data server-side.
          </p>
        ) : (
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

                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  disabled={pending}
                  onClick={() => revoke(key.id, key.name)}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
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

      <Dialog open={!!revealed} onOpenChange={(open) => !open && setRevealed(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{revealed?.name}</DialogTitle>
            <DialogDescription>
              Copy this now — it will not be shown again.
            </DialogDescription>
          </DialogHeader>
          {revealed ? <RevealedKey value={revealed.key} /> : null}
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

function RevealedKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select and copy the key manually.");
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
