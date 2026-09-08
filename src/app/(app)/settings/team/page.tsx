import type { Metadata } from "next";
import { UserPlus } from "lucide-react";

import { SettingsCard } from "@/components/settings/settings-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { teamMembers } from "@/lib/data";
import { formatDate, initials } from "@/lib/format";
import type { WorkspaceRole } from "@/types";

export const metadata: Metadata = { title: "Team & roles" };

const ROLES: {
  role: WorkspaceRole;
  label: string;
  can: string;
  cannot: string;
}[] = [
  {
    role: "owner",
    label: "Owner",
    can: "Everything, including billing and deleting the workspace.",
    cannot: "Nothing — there is always exactly one owner.",
  },
  {
    role: "admin",
    label: "Admin",
    can: "Manage invoices, customers, automations, team and integrations.",
    cannot: "Change the plan or delete the workspace.",
  },
  {
    role: "member",
    label: "Member",
    can: "Work the collections queue, send reminders, record payments.",
    cannot: "Edit automations, API keys or team membership.",
  },
  {
    role: "viewer",
    label: "Viewer",
    can: "Read invoices, customers and reports.",
    cannot: "Send anything to a customer or change a record.",
  },
];

const ROLE_TONE: Record<WorkspaceRole, string> = {
  owner: "bg-brand-muted text-brand",
  admin: "bg-success-muted text-success",
  member: "bg-muted text-foreground",
  viewer: "bg-muted text-muted-foreground",
};

export default function TeamSettingsPage() {
  return (
    <div className="space-y-3">
      <SettingsCard
        title="Team members"
        description={`${teamMembers.length} people have access to this workspace.`}
        footer={
          <Button size="sm">
            <UserPlus className="size-3.5" />
            Invite member
          </Button>
        }
      >
        <ul className="divide-y">
          {teamMembers.map((member) => (
            <li
              key={member.id}
              className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span
                aria-hidden
                className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-caption font-semibold"
              >
                {initials(member.user.full_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-medium">
                  {member.user.full_name}
                </p>
                <p className="text-muted-foreground truncate text-caption">
                  {member.user.email}
                </p>
              </div>
              <Badge className={ROLE_TONE[member.role]}>
                {member.role[0]!.toUpperCase() + member.role.slice(1)}
              </Badge>
              <span className="text-muted-foreground w-28 text-right text-caption">
                {member.status === "invited"
                  ? "Invite pending"
                  : member.last_active_at
                    ? `Active ${formatDate(member.last_active_at)}`
                    : "Never signed in"}
              </span>
            </li>
          ))}
        </ul>
      </SettingsCard>

      <SettingsCard
        title="Roles & permissions"
        description="What each role can do. Collections work needs Member; changing how money is chased needs Admin."
      >
        <ul className="divide-y">
          {ROLES.map((r) => (
            <li key={r.role} className="space-y-1 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2">
                <Badge className={ROLE_TONE[r.role]}>{r.label}</Badge>
                <span className="text-muted-foreground text-caption">
                  {teamMembers.filter((m) => m.role === r.role).length} assigned
                </span>
              </div>
              <p className="text-small">{r.can}</p>
              <p className="text-muted-foreground text-caption">
                Cannot: {r.cannot}
              </p>
            </li>
          ))}
        </ul>
      </SettingsCard>
    </div>
  );
}
