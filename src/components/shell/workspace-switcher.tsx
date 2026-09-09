"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { switchWorkspace } from "@/lib/actions/auth";
import { LogoMark } from "@/components/invoicepilot/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { Workspace } from "@/types";
import { cn } from "@/lib/utils";

const PLAN_LABEL: Record<Workspace["plan"], string> = {
  starter: "Starter",
  professional: "Professional",
  scale: "Scale",
};

export function WorkspaceSwitcher({
  workspaces,
  activeId,
}: {
  workspaces: Workspace[];
  activeId: string;
}) {
  const [pending, startTransition] = useTransition();
  // No local selected-id state: the active workspace is whatever the access
  // token says, so the server is the only thing that can change it.
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0]!;

  function select(id: string) {
    if (id === activeId) return;
    startTransition(async () => {
      const result = await switchWorkspace(id);
      if (!result.ok) toast.error("Could not switch", { description: result.message });
    });
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent"
              >
                <LogoMark className="size-6 shrink-0" />
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate text-[13px] font-semibold">
                    {active.name}
                  </span>
                  <span className="text-muted-foreground truncate text-caption">
                    {PLAN_LABEL[active.plan]} plan
                  </span>
                </span>
                <ChevronsUpDown className="ml-auto size-4 opacity-60" />
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent
            align="start"
            className="w-(--anchor-width) min-w-56"
          >
            <DropdownMenuLabel className="text-muted-foreground text-caption">
              Workspaces
            </DropdownMenuLabel>
            {workspaces.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onClick={() => select(w.id)}
                disabled={pending}
                className="gap-2"
              >
                <LogoMark className="size-5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
                <Check
                  className={cn(
                    "size-4 shrink-0",
                    w.id === active.id ? "opacity-100" : "opacity-0",
                  )}
                />
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2">
              <Plus className="size-4" />
              New workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
