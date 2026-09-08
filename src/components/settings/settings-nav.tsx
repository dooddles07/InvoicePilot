"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export const SETTINGS_NAV: { href: string; label: string; group: string }[] = [
  { href: "/settings", label: "Workspace", group: "Workspace" },
  { href: "/settings/team", label: "Team & roles", group: "Workspace" },
  { href: "/settings/billing", label: "Billing", group: "Workspace" },
  {
    href: "/settings/notifications",
    label: "Notifications",
    group: "Collections",
  },
  {
    href: "/settings/email-templates",
    label: "Email templates",
    group: "Collections",
  },
  {
    href: "/settings/automation",
    label: "Automation settings",
    group: "Collections",
  },
  { href: "/settings/api-keys", label: "API keys", group: "Developer" },
  { href: "/settings/webhooks", label: "Webhooks", group: "Developer" },
  { href: "/settings/security", label: "Security", group: "Developer" },
  { href: "/settings/audit-log", label: "Audit log", group: "Developer" },
];

const GROUPS = ["Workspace", "Collections", "Developer"] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings" className="lg:w-56 lg:shrink-0">
      {/* Horizontal scroller on small screens, sidebar on large: ten sections
          in a wrapping pile is harder to scan than a single row you swipe. */}
      <div className="scrollbar-thin -mx-3 flex gap-1 overflow-x-auto px-3 pb-2 lg:mx-0 lg:flex-col lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
        {GROUPS.map((group) => (
          <div key={group} className="flex gap-1 lg:flex-col lg:gap-0.5">
            <p className="text-muted-foreground hidden px-2 pb-1 text-caption font-medium lg:block">
              {group}
            </p>
            {SETTINGS_NAV.filter((i) => i.group === group).map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-small whitespace-nowrap transition-colors",
                    active
                      ? "bg-brand-muted text-brand font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
