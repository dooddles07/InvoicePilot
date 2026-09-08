"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/components/shell/nav";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";

export type CommandTarget = {
  id: string;
  label: string;
  sublabel: string;
  href: string;
  amount_cents?: number;
};

export function CommandMenu({
  invoices,
  customers,
}: {
  invoices: CommandTarget[];
  customers: CommandTarget[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      {/* One trigger, two shapes: a labelled search field where there is room,
          an icon button where there is not. Search stays reachable on every
          breakpoint instead of disappearing below the sidebar cutoff. */}
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Search or jump to"
        onClick={() => setOpen(true)}
        className="touch-target text-muted-foreground lg:size-auto lg:h-7 lg:w-56 lg:justify-start lg:gap-2 lg:px-2.5"
      >
        <Search className="size-3.5" />
        <span className="hidden truncate lg:inline">Search or jump to…</span>
        <kbd className="bg-muted text-muted-foreground ml-auto hidden rounded px-1.5 py-0.5 font-mono text-[10px] lg:inline-block">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search InvoicePilot"
        description="Search invoices, customers and pages."
      >
        <CommandInput placeholder="Search invoices, customers, pages…" />
        <CommandList>
          <CommandEmpty>Nothing matched that search.</CommandEmpty>

          <CommandGroup heading="Invoices">
            {invoices.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.label} ${item.sublabel}`}
                onSelect={() => go(item.href)}
              >
                <span className="font-medium">{item.label}</span>
                <span className="text-muted-foreground truncate">
                  {item.sublabel}
                </span>
                {item.amount_cents !== undefined ? (
                  <span className="tnum text-muted-foreground ml-auto">
                    {money(item.amount_cents)}
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading="Customers">
            {customers.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.label} ${item.sublabel}`}
                onSelect={() => go(item.href)}
              >
                <span className="font-medium">{item.label}</span>
                <span className="text-muted-foreground truncate">
                  {item.sublabel}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Go to">
            {[...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => (
              <CommandItem
                key={item.href}
                value={item.title}
                onSelect={() => go(item.href)}
              >
                <item.icon className="size-4" />
                {item.title}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
