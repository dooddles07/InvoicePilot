import type { Metadata } from "next";
import Link from "next/link";
import { Laptop, Smartphone } from "lucide-react";

import { SettingsCard } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = { title: "Security" };

const SESSIONS = [
  {
    id: "s1",
    device: "Chrome on Windows",
    location: "Manchester, UK",
    last: "Active now",
    current: true,
    icon: Laptop,
  },
  {
    id: "s2",
    device: "Safari on iPhone",
    location: "Manchester, UK",
    last: "Yesterday, 18:42",
    current: false,
    icon: Smartphone,
  },
  {
    id: "s3",
    device: "Firefox on macOS",
    location: "Leeds, UK",
    last: "4 Sep, 09:15",
    current: false,
    icon: Laptop,
  },
];

export default function SecuritySettingsPage() {
  return (
    <div className="space-y-3">
      <SettingsCard
        title="Authentication"
        description="Financial data deserves a second factor."
        footer={<Button size="sm">Save</Button>}
      >
        <ul className="divide-y">
          <li className="flex items-start gap-3 py-3 first:pt-0">
            <div className="min-w-0 flex-1">
              <Label htmlFor="mfa" className="text-small font-medium">
                Require two-factor authentication
              </Label>
              <p className="text-muted-foreground text-caption">
                Every member must enrol an authenticator app before they can sign
                in.
              </p>
            </div>
            <Switch id="mfa" defaultChecked />
          </li>
          <li className="flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <Label htmlFor="sso" className="text-small font-medium">
                Enforce SSO
              </Label>
              <p className="text-muted-foreground text-caption">
                Password sign-in is disabled; everyone comes through your identity
                provider.
              </p>
            </div>
            <Switch id="sso" />
          </li>
          <li className="flex items-start gap-3 py-3 last:pb-0">
            <div className="min-w-0 flex-1">
              <Label htmlFor="timeout" className="text-small font-medium">
                Sign out idle sessions after 12 hours
              </Label>
              <p className="text-muted-foreground text-caption">
                Shared machines in a finance office are the usual reason this
                matters.
              </p>
            </div>
            <Switch id="timeout" defaultChecked />
          </li>
        </ul>
      </SettingsCard>

      <SettingsCard
        title="Active sessions"
        description="Signed-in devices on your account."
        footer={
          <Button variant="outline" size="sm">
            Sign out everywhere else
          </Button>
        }
      >
        <ul className="divide-y">
          {SESSIONS.map((session) => (
            <li
              key={session.id}
              className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span
                aria-hidden
                className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg"
              >
                <session.icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-medium">
                  {session.device}
                  {session.current ? (
                    <span className="bg-success-muted text-success ml-2 rounded-full px-2 py-0.5 text-caption font-medium">
                      This device
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-foreground text-caption">
                  {session.location} · {session.last}
                </p>
              </div>
              {!session.current ? (
                <Button variant="ghost" size="sm" className="text-danger">
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </SettingsCard>

      <p className="text-muted-foreground text-caption">
        Every sign-in, permission change and export is recorded in the{" "}
        <Link href="/settings/audit-log" className="text-brand hover:underline">
          audit log
        </Link>
        .
      </p>
    </div>
  );
}
