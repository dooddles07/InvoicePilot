import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading states.
 *
 * These mirror the real layout rather than showing a spinner: matching the
 * shape of what is coming stops the page jumping when it arrives, which is
 * most of what makes a load feel slow.
 *
 * Every skeleton is `aria-hidden` behind a live region that says one useful
 * thing — a screen reader reading out forty grey boxes is worse than silence.
 */
function Loading({ label }: { label: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {label}
    </span>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-7 w-32" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Loading label="Loading your dashboard" />
      <div aria-hidden className="flex flex-col gap-4">
        <HeaderSkeleton />

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[132px] rounded-xl sm:h-[168px]" />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Skeleton className="h-[420px] rounded-xl xl:col-span-2" />
          <Skeleton className="h-[420px] rounded-xl" />
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Skeleton className="h-80 rounded-xl xl:col-span-2" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({
  label,
  rows = 10,
}: {
  label: string;
  rows?: number;
}) {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Loading label={label} />
      <div aria-hidden className="flex flex-col gap-4">
        <HeaderSkeleton />

        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-full sm:w-64" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="ml-auto h-8 w-24" />
        </div>

        <div className="overflow-hidden rounded-xl border">
          <Skeleton className="h-9 rounded-none" />
          <div className="divide-y">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="hidden h-4 w-24 sm:block" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <Loading label="Loading your collections pipeline" />
      <div aria-hidden className="flex flex-col gap-4">
        <HeaderSkeleton />
        <div className="grid gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-xl border p-2">
              <Skeleton className="h-8" />
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-28 rounded-lg" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CardGridSkeleton({
  label,
  count = 6,
  columns = "md:grid-cols-2 xl:grid-cols-3",
}: {
  label: string;
  count?: number;
  columns?: string;
}) {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Loading label={label} />
      <div aria-hidden className="flex flex-col gap-4">
        <HeaderSkeleton />
        <div className={`grid grid-cols-1 gap-3 ${columns}`}>
          {Array.from({ length: count }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function DetailSkeleton({ label }: { label: string }) {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Loading label={label} />
      <div aria-hidden className="flex flex-col gap-4">
        <Skeleton className="h-40 rounded-xl" />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <div className="space-y-3 xl:col-span-2">
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
