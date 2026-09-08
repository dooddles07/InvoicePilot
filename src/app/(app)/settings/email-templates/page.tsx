import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";

import { SettingsCard } from "@/components/settings/settings-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { emailTemplates } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Email templates" };

export default function EmailTemplatesPage() {
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
              {template.used_by.map((automation) => (
                <Badge key={automation} variant="outline">
                  {automation}
                </Badge>
              ))}
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
