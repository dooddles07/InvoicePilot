import { Info } from "lucide-react";

/**
 * Says what the data is.
 *
 * A product that shows a shared, resettable ledger without saying so is
 * lying quietly, and the person who notices will not trust the twelve screens
 * that are real either.
 */
export function DemoBanner({ workspaceId }: { workspaceId: string }) {
  // Server-only env var: this component never runs in the browser.
  if (!process.env.DEMO_WORKSPACE_ID || workspaceId !== process.env.DEMO_WORKSPACE_ID) {
    return null;
  }

  return (
    <div className="border-brand/25 bg-brand-muted text-brand flex items-center gap-2 border-b px-4 py-1.5 text-caption">
      <Info className="size-3.5 shrink-0" aria-hidden />
      <p>
        Demo workspace — shared with every visitor and rebuilt daily at 04:00
        UTC. Everything here is real, including writes: an invoice you create
        or a payment you record persists until the next rebuild, for every
        visitor. Reminder emails deliver to our own inbox instead of the
        customer&rsquo;s, since this deployment has no verified sending
        domain.
      </p>
    </div>
  );
}
