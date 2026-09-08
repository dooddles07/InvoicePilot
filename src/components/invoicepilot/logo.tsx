import { cn } from "@/lib/utils";

/**
 * The mark: a rising cash line resolving into a paper-plane nose — money
 * moving, and moving on its own. Drawn in `currentColor` so it inherits the
 * surface it sits on rather than carrying its own hardcoded brand colour.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("size-6", className)}
    >
      <rect
        x="0.5"
        y="0.5"
        width="23"
        height="23"
        rx="6.5"
        className="fill-primary stroke-primary"
      />
      <path
        d="M5.5 15.5 L10 11 L13 14 L18.5 7.5"
        className="stroke-primary-foreground"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 7.5 H18.5 V11.5"
        className="stroke-primary-foreground"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="11" r="1.4" className="fill-primary-foreground" />
    </svg>
  );
}

export function Logo({
  className,
  wordmarkClassName,
}: {
  className?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      <span
        className={cn(
          "text-[15px] font-semibold tracking-tight",
          wordmarkClassName,
        )}
      >
        InvoicePilot
      </span>
    </span>
  );
}
