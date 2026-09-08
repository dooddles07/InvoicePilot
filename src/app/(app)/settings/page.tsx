import type { Metadata } from "next";

import { SettingsCard } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";
import { workspace } from "@/lib/data";

export const metadata: Metadata = { title: "Workspace settings" };

export default function WorkspaceSettingsPage() {
  return (
    <div className="space-y-3">
      <SettingsCard
        title="Workspace"
        description="How this business appears on invoices and in reminders."
        footer={<Button size="sm">Save changes</Button>}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">Business name</Label>
            <Input id="ws-name" defaultValue={workspace.name} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-slug">Workspace URL</Label>
            <Input id="ws-slug" defaultValue={workspace.slug} />
            <p className="text-muted-foreground text-caption">
              invoicepilot.com/{workspace.slug}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-email">Reply-to address</Label>
            <Input
              id="ws-email"
              type="email"
              defaultValue="accounts@meridianstudio.com"
            />
            <p className="text-muted-foreground text-caption">
              Where customer replies to reminders land.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-currency">Currency</Label>
            <Input id="ws-currency" defaultValue="USD — US Dollar" readOnly />
            <p className="text-muted-foreground text-caption">
              Changing currency affects every historical figure, so it is done
              by support rather than in-app.
            </p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Defaults for new invoices"
        description="Applied unless a customer has their own agreed terms."
        footer={<Button size="sm">Save defaults</Button>}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ws-terms">Payment terms</Label>
            <Input id="ws-terms" type="number" defaultValue={30} className="tnum" />
            <p className="text-muted-foreground text-caption">
              Days from issue to due date.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-prefix">Invoice number prefix</Label>
            <Input id="ws-prefix" defaultValue="INV" className="font-mono" />
          </div>
        </div>
      </SettingsCard>

      <p className="text-muted-foreground text-caption">
        Workspace created {formatDate(workspace.created_at)}.
      </p>
    </div>
  );
}
