import type { Metadata } from "next";
import { Download } from "lucide-react";

import { SettingsCard } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";
import { auditLogs } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditLogPage() {
  return (
    <SettingsCard
      title="Audit log"
      description="Every action that changed a record or sent something to a customer. Retained for 24 months."
      footer={
        <Button variant="outline" size="sm">
          <Download className="size-3.5" />
          Export CSV
        </Button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-small">
          <caption className="sr-only">Workspace audit log</caption>
          <thead>
            <tr className="text-muted-foreground text-caption">
              <th scope="col" className="pb-2 text-left font-medium">
                Actor
              </th>
              <th scope="col" className="pb-2 text-left font-medium">
                Action
              </th>
              <th scope="col" className="pb-2 text-left font-medium">
                Target
              </th>
              <th scope="col" className="hidden pb-2 text-left font-medium sm:table-cell">
                IP
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                When
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {auditLogs.map((entry) => (
              <tr key={entry.id}>
                <td className="py-2.5 pr-3 font-medium whitespace-nowrap">
                  {entry.actor}
                </td>
                <td className="py-2.5 pr-3 whitespace-nowrap">{entry.action}</td>
                <td className="text-muted-foreground py-2.5 pr-3 text-caption">
                  {entry.target}
                </td>
                <td className="text-muted-foreground hidden py-2.5 pr-3 font-mono text-caption sm:table-cell">
                  {entry.ip}
                </td>
                <td className="text-muted-foreground tnum py-2.5 text-right text-caption whitespace-nowrap">
                  {formatDate(entry.occurred_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SettingsCard>
  );
}
