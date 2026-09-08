import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * No screen in InvoicePilot is ever blank. An empty state either celebrates
 * (nothing overdue) or invites the one action that fills it.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "neutral",
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "neutral" | "positive";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center",
        tone === "positive"
          ? "border-success/30 bg-success-muted/40"
          : "border-border bg-muted/30",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-full",
          tone === "positive"
            ? "bg-success/12 text-success"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-h3 font-semibold tracking-tight">{title}</p>
        <p className="text-muted-foreground mx-auto max-w-sm text-small">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}
