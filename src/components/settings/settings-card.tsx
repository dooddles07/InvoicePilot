import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SettingsCard({
  title,
  description,
  footer,
  children,
  className,
}: {
  title: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("bg-card shadow-e1 overflow-hidden rounded-xl border", className)}
    >
      <header className="border-b px-4 py-3">
        <h2 className="text-h3 font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-caption">{description}</p>
        ) : null}
      </header>
      <div className="p-4">{children}</div>
      {footer ? (
        <footer className="bg-muted/20 flex items-center justify-end gap-2 border-t px-4 py-2.5">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
