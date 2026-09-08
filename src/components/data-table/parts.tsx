"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Search,
  X,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Presentational pieces shared by every table screen. Deliberately not a
 * generic `<DataTable>` — each screen owns its own columns and state, and only
 * the chrome around them repeats.
 */

export const HEAD_LABEL =
  "text-caption font-semibold uppercase tracking-wider text-muted-foreground";

export function SortHeader({
  label,
  sorted,
  onToggle,
  align = "start",
}: {
  label: string;
  sorted: false | "asc" | "desc";
  onToggle: () => void;
  align?: "start" | "end";
}) {
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <div className={cn("flex", align === "end" && "justify-end")}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Sort by ${label}`}
        className={cn(
          HEAD_LABEL,
          "focus-visible:ring-ring -mx-1 inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 transition-colors focus-visible:ring-2 focus-visible:outline-none",
          "hover:text-foreground",
          sorted && "text-foreground",
        )}
      >
        {label}
        <Icon
          className={cn("size-3.5", !sorted && "text-muted-foreground/60")}
          aria-hidden
        />
      </button>
    </div>
  );
}

export function TableSearch({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  // Full width on its own line below sm: squeezed into a wrapping filter row,
  // the field collapses to little more than its icon.
  return (
    <div className="relative w-full min-w-0 sm:max-w-xs sm:flex-1">
      <Search
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
      />
      <Input
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 pl-8 text-small"
      />
    </div>
  );
}

/**
 * Appears only when rows are selected. Sits above the table rather than
 * floating over it, so it never covers the rows the user just chose.
 */
export function BulkBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div
      role="region"
      aria-label={`${count} selected`}
      className="bg-brand-muted/60 border-brand/25 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
    >
      <div className="flex items-center gap-1">
        <span className="tnum text-small font-medium">{count} selected</span>
        <Button
          variant="ghost"
          size="xs"
          onClick={onClear}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" />
          Clear
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

export function TablePagination({
  page,
  pageCount,
  total,
  noun,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
}: {
  page: number;
  pageCount: number;
  total: number;
  noun: string;
  onPrevious: () => void;
  onNext: () => void;
  canPrevious: boolean;
  canNext: boolean;
}) {
  return (
    <div className="bg-muted/20 flex items-center justify-between gap-3 border-t px-3 py-2">
      <p className="text-muted-foreground text-caption">
        <span className="tnum text-foreground font-medium">{total}</span> {noun}
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onPrevious}
          disabled={!canPrevious}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <span className="tnum text-muted-foreground px-1 text-caption">
          Page {page} of {Math.max(pageCount, 1)}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Next page"
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
