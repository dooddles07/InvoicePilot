import Link from "next/link";

import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A customer, wherever one appears in a list. Initials rather than photos:
 * these are companies, and a consistent monogram reads faster in a dense
 * table than a grid of mismatched logos.
 */
export function CustomerCell({
  id,
  name,
  sublabel,
  className,
}: {
  id: string;
  name: string;
  sublabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold"
      >
        {initials(name)}
      </span>
      <span className="min-w-0">
        <Link
          href={`/customers/${id}`}
          className="block truncate text-small font-medium hover:underline"
        >
          {name}
        </Link>
        {sublabel ? (
          <span className="text-muted-foreground block truncate text-caption">
            {sublabel}
          </span>
        ) : null}
      </span>
    </div>
  );
}
