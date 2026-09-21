import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";

import { SettingsCard } from "@/components/settings/settings-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { handleReadError } from "@/lib/api/client";
import { getEmailTemplates } from "@/lib/api/notifications";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Email templates" };

const TONE_LABEL = { friendly: "Friendly", firm: "Firm", final: "Final" } as const;

export default async function EmailTemplatesPage() {
  const { data: emailTemplates } = await getEmailTemplates().catch(handleReadError);

  return (
    <SettingsCard
      title="Email templates"
      description="The wording customers actually receive. Placeholders in double braces are filled from the invoice."
      footer={
        <Button size="sm">
          <Plus className="size-3.5" />
          New template
        </Button>
      }
    >
      <ul className="divide-y">
        {emailTemplates.map((template) => (
          <li key={template.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-small font-medium">{template.name}</h3>
              <Badge variant="outline">{TONE_LABEL[template.tone]}</Badge>
              <Button
                variant="ghost"
                size="xs"
                className="ml-auto"
                aria-label={`Edit ${template.name}`}
              >
                <Pencil className="size-3" />
                Edit
              </Button>
            </div>

            <p className="text-small">
              <span className="text-muted-foreground">Subject: </span>
              {template.subject}
            </p>

            <pre className="bg-muted/40 text-muted-foreground overflow-x-auto rounded-lg border p-3 font-sans text-caption leading-relaxed whitespace-pre-wrap">
              {template.body}
            </pre>

            <p className="text-muted-foreground text-caption">
              Updated {formatDate(template.updated_at)}
            </p>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
