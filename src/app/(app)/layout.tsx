import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { TopBar, type Notification } from "@/components/shell/top-bar";
import type { CommandTarget } from "@/components/shell/command-menu";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  customers,
  getNeedsAttention,
  invoices,
  overdueInvoices,
} from "@/lib/data";
import { money } from "@/lib/format";
import { requireSession } from "@/lib/api/session";
import type { Workspace } from "@/types";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // The only unfaked data in this layout for now: who is signed in, and which
  // workspace their token is scoped to. Everything below is still fixtures
  // until plan 3 converts the read path.
  const session = await requireSession();

  const currentUser = {
    id: session.id,
    email: session.email,
    full_name: session.full_name,
    avatar_url: session.avatar_url,
  };
  // The switcher only reads id/name/plan; the rest of Workspace is not known
  // from the session and not needed here.
  const activeWorkspace = {
    id: session.workspace_id,
    name: session.workspace_name,
    plan: "starter",
  } as Workspace;
  const workspaces = [activeWorkspace];

  // The shell is a Server Component: search targets and counts are computed
  // once here rather than shipping the whole ledger to the client.
  const commandInvoices: CommandTarget[] = invoices.slice(0, 40).map((i) => ({
    id: i.id,
    label: i.number,
    sublabel: i.customer_name,
    href: `/invoices/${i.id}`,
    amount_cents: i.balance_cents || i.amount_cents,
  }));

  const commandCustomers: CommandTarget[] = customers.slice(0, 40).map((c) => ({
    id: c.id,
    label: c.name,
    sublabel: `${c.open_invoice_count} open · ${money(c.outstanding_cents)}`,
    href: `/customers/${c.id}`,
  }));

  const notifications: Notification[] = getNeedsAttention(4).map((item) => ({
    id: item.invoice_id,
    title: `${item.customer_name} — ${money(item.balance_cents)}`,
    detail: `${item.invoice_number} · ${item.recommended_action}`,
    href: `/invoices/${item.invoice_id}`,
    when: `${item.days_overdue} days overdue`,
  }));

  return (
    <SidebarProvider>
      <AppSidebar
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspace.id}
        user={currentUser}
        overdueCount={overdueInvoices.length}
      />
      <SidebarInset className="min-w-0">
        <TopBar
          invoices={commandInvoices}
          customers={commandCustomers}
          notifications={notifications}
        />
        {/* Bottom padding clears the mobile nav bar. */}
        <div className="min-w-0 flex-1 px-3 pt-4 pb-24 sm:px-5 sm:pt-5 lg:pb-8">
          {children}
        </div>
      </SidebarInset>
      <MobileNav overdueCount={overdueInvoices.length} />
    </SidebarProvider>
  );
}
