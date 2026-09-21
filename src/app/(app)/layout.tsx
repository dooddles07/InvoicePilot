import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { TopBar, type Notification } from "@/components/shell/top-bar";
import type { CommandTarget } from "@/components/shell/command-menu";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DemoBanner } from "@/components/invoicepilot/demo-banner";
import { getCollectionQueue } from "@/lib/api/collections";
import { getCustomers } from "@/lib/api/customers";
import { getInvoices } from "@/lib/api/invoices";
import { money } from "@/lib/format";
import { requireSession } from "@/lib/api/session";
import type { Workspace } from "@/types";

export default async function AppLayout({ children }: LayoutProps<"/">) {
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
  // once here rather than shipping the whole ledger to the client. The
  // notification list now comes from the real recovery-ranked queue
  // (collection_queue, one row per customer) instead of Phase 2's plain
  // balance sort; overdueCount still needs its own call, since the queue is
  // deduped per customer and would undercount a customer with two overdue
  // invoices.
  const [commandInvoicesResult, overdueCountResult, commandCustomersResult, queueResult] =
    await Promise.all([
      getInvoices({ limit: 40 }),
      getInvoices({ overdue: true, limit: 1 }),
      getCustomers({ limit: 40 }),
      getCollectionQueue(4),
    ]);

  const commandInvoices: CommandTarget[] = commandInvoicesResult.data.map((i) => ({
    id: i.id,
    label: i.number,
    sublabel: i.customer_name,
    href: `/invoices/${i.id}`,
    amount_cents: i.balance_cents || i.amount_cents,
  }));

  const commandCustomers: CommandTarget[] = commandCustomersResult.data.map((c) => ({
    id: c.id,
    label: c.name,
    sublabel: `${c.open_invoice_count} open · ${money(c.outstanding_cents)}`,
    href: `/customers/${c.id}`,
  }));

  const overdueCount = overdueCountResult.total;

  const notifications: Notification[] = queueResult.data.map((item) => ({
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
