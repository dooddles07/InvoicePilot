"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/invoicepilot/link-button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CommandMenu, type CommandTarget } from "@/components/shell/command-menu";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { PRIMARY_NAV, SECONDARY_NAV, SUPPORT_NAV } from "@/components/shell/nav";

export type Notification = {
  id: string;
  title: string;
  detail: string;
  href: string;
  when: string;
};

const ALL_NAV = [...PRIMARY_NAV, ...SECONDARY_NAV, ...SUPPORT_NAV];

export function TopBar({
  invoices,
  customers,
  notifications,
}: {
  invoices: CommandTarget[];
  customers: CommandTarget[];
  notifications: Notification[];
}) {
  const pathname = usePathname();
  const current =
    ALL_NAV.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
      ?.title ?? "Overview";

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur sm:px-4">
      <SidebarTrigger aria-label="Toggle navigation" className="touch-target" />
      <Separator orientation="vertical" className="mr-1 hidden h-4 lg:block" />

      <h2 className="truncate text-[13px] font-medium lg:hidden">{current}</h2>

      <div className="ml-auto flex items-center gap-1.5 lg:ml-0 lg:flex-1">
        <CommandMenu invoices={invoices} customers={customers} />

        <div className="ml-auto flex items-center gap-1.5">
          <LinkButton
            size="sm"
            href="/invoices/new"
            className="hidden sm:inline-flex"
          >
            <Plus className="size-3.5" />
            New invoice
          </LinkButton>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Notifications, ${notifications.length} unread`}
                  className="touch-target relative"
                >
                  <Bell className="size-4" />
                  {notifications.length > 0 ? (
                    <span className="bg-danger absolute top-1 right-1 size-1.5 rounded-full ring-2 ring-background" />
                  ) : null}
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifications.map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  className="flex-col items-start gap-0.5 py-2"
                  render={<Link href={n.href} />}
                >
                  <span className="text-small font-medium">{n.title}</span>
                  <span className="text-muted-foreground text-caption">
                    {n.detail}
                  </span>
                  <span className="text-muted-foreground text-caption">
                    {n.when}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
