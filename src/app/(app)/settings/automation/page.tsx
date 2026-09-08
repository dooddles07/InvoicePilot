import type { Metadata } from "next";
import Link from "next/link";

import { SettingsCard } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const metadata: Metadata = { title: "Automation settings" };

const GUARDRAILS = [
  {
    id: "quiet-hours",
    label: "Respect quiet hours",
    description:
      "Nothing sends before 08:00 or after 18:00 in the customer's timezone.",
    defaultOn: true,
  },
  {
    id: "weekends",
    label: "Skip weekends",
    description: "Delays measured in business days, and no sends on Sat or Sun.",
    defaultOn: true,
  },
  {
    id: "pause-disputed",
    label: "Pause on dispute",
    description:
      "A disputed invoice stops its sequence automatically. Chasing a disputed balance costs goodwill and rarely moves the money.",
    defaultOn: true,
  },
  {
    id: "pause-promise",
    label: "Pause on a promised payment date",
    description:
      "If a customer commits to a date, reminders hold until the day after it passes.",
    defaultOn: true,
  },
  {
    id: "require-approval",
    label: "Require approval above a threshold",
    description:
      "Escalations on large balances wait for a human before they send.",
    defaultOn: false,
  },
];

export default function AutomationSettingsPage() {
  return (
    <div className="space-y-3">
      <SettingsCard
        title="Guardrails"
        description="Limits that apply to every automation, however it is built."
        footer={<Button size="sm">Save guardrails</Button>}
      >
        <ul className="divide-y">
          {GUARDRAILS.map((rule) => (
            <li
              key={rule.id}
              className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <Label htmlFor={rule.id} className="text-small font-medium">
                  {rule.label}
                </Label>
                <p className="text-muted-foreground text-caption">
                  {rule.description}
                </p>
              </div>
              <Switch id={rule.id} defaultChecked={rule.defaultOn} />
            </li>
          ))}
        </ul>
      </SettingsCard>

      <SettingsCard
        title="Send limits"
        description="A cap on how often a single customer can hear from you, across all automations."
        footer={<Button size="sm">Save limits</Button>}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="max-per-week">Maximum messages per customer, per week</Label>
            <Input id="max-per-week" type="number" defaultValue={2} className="tnum" />
            <p className="text-muted-foreground text-caption">
              Back-to-back chasing lowers the reply rate. Two is usually the
              ceiling before an account stops reading.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="approval-threshold">Approval threshold</Label>
            <Input
              id="approval-threshold"
              type="number"
              defaultValue={10000}
              className="tnum"
            />
            <p className="text-muted-foreground text-caption">
              Escalations above this amount wait for a person.
            </p>
          </div>
        </div>
      </SettingsCard>

      <p className="text-muted-foreground text-caption">
        Individual sequences live in{" "}
        <Link href="/automations" className="text-brand hover:underline">
          Automation
        </Link>
        .
      </p>
    </div>
  );
}
