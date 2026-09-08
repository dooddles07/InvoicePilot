"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  MOBILE_NAV,
  PRIMARY_NAV,
  SECONDARY_NAV,
  SUPPORT_NAV,
} from "@/components/shell/nav";
import { cn } from "@/lib/utils";

/**
 * Mobile gets its own navigation rather than a shrunken sidebar: four
 * thumb-reachable destinations plus a "More" sheet for everything else.
 * Every target is at least 44px tall and the bar clears the home indicator.
 */
export function MobileNav({ overdueCount }: { overdueCount: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const overflow = [
    ...PRIMARY_NAV.filter((i) => !MOBILE_NAV.some((m) => m.href === i.href)),
    ...SECONDARY_NAV,
    ...SUPPORT_NAV,
  ];

  return (
    <nav
      aria-label="Primary"
      className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {MOBILE_NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors",
                  active ? "text-brand" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <item.icon className="size-5" aria-hidden />
                  {item.badge === "overdue" && overdueCount > 0 ? (
                    <span className="bg-danger text-danger-foreground absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
                      {overdueCount > 99 ? "99+" : overdueCount}
                    </span>
                  ) : null}
                </span>
                <span className="truncate">{item.title}</span>
              </Link>
            </li>
          );
        })}

        <li>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className={cn(
                "text-muted-foreground flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium",
              )}
            >
              <MoreHorizontal className="size-5" aria-hidden />
              More
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>More</SheetTitle>
              </SheetHeader>
              <ul className="grid grid-cols-2 gap-2 p-4 pt-0">
                {overflow.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "hover:bg-muted flex min-h-[52px] items-center gap-2.5 rounded-lg border px-3 text-small font-medium transition-colors",
                        isActive(item.href) && "border-brand/40 bg-brand-muted text-brand",
                      )}
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
