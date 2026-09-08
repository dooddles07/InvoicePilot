"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, GripVertical, Move } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/invoicepilot/empty-state";
import { RiskBadge } from "@/components/invoicepilot/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { formatDateShort, initials, money } from "@/lib/format";
import type { CollectionStage, Invoice } from "@/types";
import { cn } from "@/lib/utils";

export type Column = {
  key: CollectionStage;
  label: string;
  invoices: Invoice[];
  total_cents: number;
};

const STAGE_ACCENT: Record<CollectionStage, string> = {
  upcoming: "bg-aging-current",
  due_today: "bg-aging-1",
  late_1_30: "bg-aging-2",
  late_31_60: "bg-aging-3",
  late_60_plus: "bg-aging-4",
};

/**
 * The collections pipeline.
 *
 * Drag-and-drop is the fast path, not the only path: every card also carries a
 * "Move to" menu, so the board is fully operable from the keyboard. A board
 * that can only be driven by a mouse is a board half the team cannot use.
 */
export function PipelineBoard({ columns }: { columns: Column[] }) {
  const [board, setBoard] = useState(columns);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<CollectionStage | null>(null);

  const move = (invoiceId: string, to: CollectionStage) => {
    const from = board.find((c) => c.invoices.some((i) => i.id === invoiceId));
    if (!from || from.key === to) return;

    const invoice = from.invoices.find((i) => i.id === invoiceId)!;
    setBoard((prev) =>
      prev.map((col) => {
        if (col.key === from.key) {
          const invoices = col.invoices.filter((i) => i.id !== invoiceId);
          return {
            ...col,
            invoices,
            total_cents: invoices.reduce((s, i) => s + i.balance_cents, 0),
          };
        }
        if (col.key === to) {
          const invoices = [invoice, ...col.invoices];
          return {
            ...col,
            invoices,
            total_cents: invoices.reduce((s, i) => s + i.balance_cents, 0),
          };
        }
        return col;
      }),
    );

    const target = board.find((c) => c.key === to)!;
    toast.success("Moved in pipeline", {
      description: `${invoice.number} moved to ${target.label}. The collection sequence for this invoice restarts.`,
    });
  };

  return (
    <div className="-mx-3 overflow-x-auto px-3 pb-2 sm:-mx-5 sm:px-5">
      <div className="flex snap-x snap-mandatory gap-3 lg:grid lg:grid-cols-5 lg:snap-none">
        {board.map((column) => (
          <section
            key={column.key}
            aria-label={`${column.label}, ${column.invoices.length} invoices`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(column.key);
            }}
            onDragLeave={() => setOver((o) => (o === column.key ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/plain") || dragging;
              if (id) move(id, column.key);
            }}
            className={cn(
              // A column scrolls inside itself. Letting 30 cards push the
              // page to 4,000px turns a triage board into a scroll marathon.
              "bg-muted/40 flex max-h-[calc(100svh-15rem)] w-[85vw] shrink-0 snap-start flex-col rounded-xl border transition-colors sm:w-72 lg:w-auto",
              over === column.key && "border-brand bg-brand-muted/50",
            )}
          >
            <header className="flex items-center gap-2 border-b px-3 py-2.5">
              <span
                aria-hidden
                className={cn("size-2 shrink-0 rounded-full", STAGE_ACCENT[column.key])}
              />
              <h2 className="min-w-0 flex-1 truncate text-small font-semibold">
                {column.label}
              </h2>
              <span className="tnum text-muted-foreground text-caption">
                {column.invoices.length}
              </span>
            </header>

            <p className="figure text-muted-foreground border-b px-3 py-1.5 text-caption">
              <span className="text-foreground font-semibold">
                {money(column.total_cents)}
              </span>{" "}
              in stage
            </p>

            <Stagger className="scrollbar-thin flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2">
              {column.invoices.length === 0 ? (
                <p className="text-muted-foreground px-1 py-6 text-center text-caption">
                  Nothing here.
                </p>
              ) : (
                column.invoices.map((invoice) => (
                  <StaggerItem key={invoice.id}>
                    <article
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", invoice.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragging(invoice.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      className={cn(
                        "bg-card shadow-e1 group space-y-2 rounded-lg border p-2.5 transition-shadow",
                        "hover:shadow-e2",
                        dragging === invoice.id && "opacity-50",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical
                          aria-hidden
                          className="text-muted-foreground/50 mt-0.5 size-3.5 shrink-0 cursor-grab"
                        />
                        <span
                          aria-hidden
                          className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                        >
                          {initials(invoice.customer_name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/customers/${invoice.customer_id}`}
                            className="block truncate text-small font-medium hover:underline"
                          >
                            {invoice.customer_name}
                          </Link>
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="text-muted-foreground block truncate font-mono text-[11px] hover:underline"
                          >
                            {invoice.number}
                          </Link>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="touch-target"
                                aria-label={`Move ${invoice.number} to another stage`}
                              >
                                <Move className="size-3" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel className="text-muted-foreground text-caption">
                              Move to
                            </DropdownMenuLabel>
                            {board
                              .filter((c) => c.key !== column.key)
                              .map((c) => (
                                <DropdownMenuItem
                                  key={c.key}
                                  onClick={() => move(invoice.id, c.key)}
                                >
                                  {c.label}
                                </DropdownMenuItem>
                              ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="flex items-baseline justify-between gap-2">
                        <span className="figure text-small font-semibold">
                          {money(invoice.balance_cents)}
                        </span>
                        <span
                          className={cn(
                            "text-caption",
                            invoice.days_overdue > 0
                              ? "text-danger"
                              : "text-muted-foreground",
                          )}
                        >
                          {invoice.days_overdue > 0
                            ? `${invoice.days_overdue}d late`
                            : invoice.days_overdue === 0
                              ? "due today"
                              : `in ${Math.abs(invoice.days_overdue)}d`}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <RiskBadge risk={invoice.risk} />
                        <span className="text-muted-foreground text-caption">
                          {invoice.last_contacted_at
                            ? `last contact ${formatDateShort(invoice.last_contacted_at)}`
                            : "not yet contacted"}
                        </span>
                      </div>

                      {invoice.next_action ? (
                        <p className="text-muted-foreground border-t pt-1.5 text-caption">
                          Next: {invoice.next_action}
                        </p>
                      ) : null}
                    </article>
                  </StaggerItem>
                ))
              )}
            </Stagger>
          </section>
        ))}
      </div>

      {board.every((c) => c.invoices.length === 0) ? (
        <EmptyState
          className="mt-3"
          icon={CheckCircle2}
          tone="positive"
          title="The pipeline is clear"
          description="Every invoice has been settled. InvoicePilot will surface anything that slips."
        />
      ) : null}
    </div>
  );
}
