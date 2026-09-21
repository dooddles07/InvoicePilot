import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { TopBar, type Notification } from "@/components/shell/top-bar";
import type { CommandTarget } from "@/components/shell/command-menu";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DemoBanner } from "@/components/invoicepilot/demo-banner";
import { customers } from "@/lib/data";
import { getInvoices } from "@/lib/api/invoices";
import { money } from "@/lib/format";
import { requireSession } from "@/lib/api/session";
import type { Workspace } from "@/types";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Invoices are real as of Phase 2; customers stay fixtures until Phase 3
  // converts /customers, so commandCustomers below is the one thing here
  // still reading from the seed.
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
  // once here rather than shipping the whole ledger to the client. Two calls,
  // not three: the overdue-ranked fetch below supplies both the notification
  // list and, from its `total`, the overdue count -- no separate count query.
  const [commandInvoicesResult, overdueResult] = await Promise.all([
    getInvoices({ limit: 40 }),
    getInvoices({ overdue: true, sort: "balance_cents", order: "desc", limit: 4 }),
  ]);

  const commandInvoices: CommandTarget[] = commandInvoicesResult.data.map((i) => ({
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

  const overdueCount = overdueResult.total;

  // recommended_action is next_action as the invoices view derives it; the
  // richer cross-customer ai_note (payment history, last-contacted timing)
  // is collections work and lands with that domain.
  const notifications: Notification[] = overdueResult.data.map((i) => ({
    id: i.id,
    title: `${i.customer_name} — ${money(i.balance_cents)}`,
    detail: `${i.number} · ${i.next_action ?? "Follow up"}`,
    href: `/invoices/${i.id}`,
    when: `${i.days_overdue} days overdue`,
  }));

  return (
    <SidebarProvider>
      <AppSidebar
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspace.id}
        user={currentUser}
        overdueCount={overdueCount}
      />
      <SidebarInset className="min-w-0">
        <TopBar
          invoices={commandInvoices}
          customers={commandCustomers}
          notifications={notifications}
        />
        <DemoBanner workspaceId={session.workspace_id} />
        {/* Bottom padding clears the mobile nav bar. */}
        <div className="min-w-0 flex-1 px-3 pt-4 pb-24 sm:px-5 sm:pt-5 lg:pb-8">
          {children}
        </div>
      </SidebarInset>
      <MobileNav overdueCount={overdueCount} />
    </SidebarProvider>
  );
}
