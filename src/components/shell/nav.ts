import {
  Bot,
  Building2,
  CreditCard,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  PhoneCall,
  PieChart,
  Plug,
  Settings,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Rendered as a count on the nav row; the number is the point, not decoration. */
  badge?: "overdue";
};

/** Work order: what the money is doing, then who owes it, then how you chase it. */
export const PRIMARY_NAV: NavItem[] = [
  { title: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { title: "Invoices", href: "/invoices", icon: FileText },
  { title: "Customers", href: "/customers", icon: Building2 },
  { title: "Collections", href: "/collections", icon: PhoneCall, badge: "overdue" },
  { title: "Payments", href: "/payments", icon: CreditCard },
  { title: "Automation", href: "/automations", icon: Workflow },
  { title: "Ask InvoicePilot", href: "/ai", icon: Bot },
  { title: "Reports", href: "/reports", icon: PieChart },
];

export const SECONDARY_NAV: NavItem[] = [
  { title: "Integrations", href: "/integrations", icon: Plug },
  { title: "Settings", href: "/settings", icon: Settings },
];

export const SUPPORT_NAV: NavItem[] = [
  { title: "Help & support", href: "/settings/support", icon: LifeBuoy },
];

/** Five is the ceiling for a thumb-reachable bottom bar; the rest lives in More. */
export const MOBILE_NAV: NavItem[] = [
  PRIMARY_NAV[0]!,
  PRIMARY_NAV[1]!,
  PRIMARY_NAV[3]!,
  PRIMARY_NAV[2]!,
];
