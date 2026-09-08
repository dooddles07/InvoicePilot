"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, LogOut, UserRound } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { WorkspaceSwitcher } from "@/components/shell/workspace-switcher";
import { PRIMARY_NAV, SECONDARY_NAV, SUPPORT_NAV } from "@/components/shell/nav";
import type { NavItem } from "@/components/shell/nav";
import type { User, Workspace } from "@/types";
import { initials } from "@/lib/format";

export function AppSidebar({
  workspaces,
  activeWorkspaceId,
  user,
  overdueCount,
}: {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  user: User;
  overdueCount: number;
}) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const renderItem = (item: NavItem) => (
    <SidebarMenuItem key={item.href}>
      <SidebarMenuButton
        isActive={isActive(item.href)}
        tooltip={item.title}
        render={
          <Link href={item.href}>
            <item.icon />
            <span>{item.title}</span>
          </Link>
        }
      />
      {item.badge === "overdue" && overdueCount > 0 ? (
        <SidebarMenuBadge className="text-danger">{overdueCount}</SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher workspaces={workspaces} activeId={activeWorkspaceId} />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{PRIMARY_NAV.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{SECONDARY_NAV.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{SUPPORT_NAV.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton size="lg">
                    <span className="bg-brand-muted text-brand flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold">
                      {initials(user.full_name)}
                    </span>
                    <span className="grid min-w-0 flex-1 text-left leading-tight">
                      <span className="truncate text-[13px] font-medium">
                        {user.full_name}
                      </span>
                      <span className="text-muted-foreground truncate text-caption">
                        {user.email}
                      </span>
                    </span>
                    <ChevronsUpDown className="ml-auto size-4 opacity-60" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent
                align="start"
                side="top"
                className="w-(--anchor-width) min-w-56"
              >
                <DropdownMenuLabel className="text-muted-foreground text-caption">
                  {user.email}
                </DropdownMenuLabel>
                <DropdownMenuItem render={<Link href="/settings" />}>
                  <UserRound className="size-4" />
                  Account settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/login" />}>
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
