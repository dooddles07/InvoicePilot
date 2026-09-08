import {
  AlertTriangle,
  Banknote,
  Bot,
  Eye,
  Mail,
  MessageSquare,
  Phone,
  Send,
  StickyNote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { formatDate } from "@/lib/format";
import type { CollectionEvent, CollectionEventType } from "@/types";
import { cn } from "@/lib/utils";

const ICON: Record<CollectionEventType, LucideIcon> = {
  invoice_sent: Send,
  invoice_viewed: Eye,
  reminder_sent: Mail,
  escalation_sent: MessageSquare,
  call_logged: Phone,
  note_added: StickyNote,
  payment_received: Banknote,
  dispute_raised: AlertTriangle,
  automation_ran: Bot,
};

const TONE: Partial<Record<CollectionEventType, string>> = {
  payment_received: "bg-success-muted text-success",
  dispute_raised: "bg-warning-muted text-warning",
  escalation_sent: "bg-danger-muted text-danger",
  automation_ran: "bg-brand-muted text-brand",
};

/**
 * Communication history and activity log share one component — they are the
 * same sequence of events, filtered differently.
 */
export function Timeline({
  events,
  emptyLabel = "Nothing has happened on this invoice yet.",
  className,
}: {
  events: CollectionEvent[];
  emptyLabel?: string;
  className?: string;
}) {
  if (events.length === 0) {
    return (
      <p className={cn("text-muted-foreground text-small", className)}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <ol className={cn("relative space-y-4", className)}>
      {/* The rail is drawn once behind the markers rather than as a border on
          each item, so it stops cleanly at the last event. */}
      <span
        aria-hidden
        className="bg-border absolute top-2 bottom-2 left-[13px] w-px"
      />
      {events.map((event) => {
        const Icon = ICON[event.type];
        return (
          <li key={event.id} className="relative flex gap-3">
            <span
              className={cn(
                "bg-muted text-muted-foreground ring-card z-10 flex size-[27px] shrink-0 items-center justify-center rounded-full ring-4",
                TONE[event.type],
              )}
            >
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pb-0.5">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-small font-medium">{event.summary}</span>
                <time
                  dateTime={event.occurred_at}
                  className="text-muted-foreground text-caption"
                >
                  {formatDate(event.occurred_at)}
                </time>
              </p>
              {event.detail ? (
                <p className="text-muted-foreground text-caption">
                  {event.detail}
                </p>
              ) : null}
              <p className="text-muted-foreground text-caption">
                {event.actor}
                {event.channel && event.channel !== "system"
                  ? ` · ${event.channel}`
                  : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
