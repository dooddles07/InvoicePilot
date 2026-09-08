import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  Eye,
  FileText,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { InvoiceStatus, RiskLevel } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Status and risk are the two things a finance manager scans for, so neither
 * is ever encoded by colour alone: each badge carries an icon *and* a word.
 * That is also what makes them legible to colour-blind users and in print.
 */

const STATUS: Record<
  InvoiceStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  draft: {
    label: "Draft",
    icon: FileText,
    className: "bg-muted text-muted-foreground ring-border",
  },
  sent: {
    label: "Sent",
    icon: Send,
    className: "bg-muted text-foreground/80 ring-border",
  },
  viewed: {
    label: "Viewed",
    icon: Eye,
    className: "bg-brand-muted text-brand ring-brand/20",
  },
  partially_paid: {
    label: "Partially paid",
    icon: CircleDot,
    className: "bg-warning-muted text-warning ring-warning/25",
  },
  paid: {
    label: "Paid",
    icon: CheckCircle2,
    className: "bg-success-muted text-success ring-success/25",
  },
  overdue: {
    label: "Overdue",
    icon: Clock,
    className: "bg-danger-muted text-danger ring-danger/25",
  },
  disputed: {
    label: "Disputed",
    icon: AlertTriangle,
    className: "bg-warning-muted text-warning ring-warning/30",
  },
};

const RISK: Record<
  RiskLevel,
  { label: string; icon: LucideIcon; className: string }
> = {
  low: {
    label: "Low",
    icon: ShieldCheck,
    className: "bg-success-muted text-success ring-success/25",
  },
  medium: {
    label: "Medium",
    icon: ShieldQuestion,
    className: "bg-warning-muted text-warning ring-warning/25",
  },
  high: {
    label: "High",
    icon: ShieldAlert,
    className: "bg-danger-muted text-danger ring-danger/25",
  },
};

const base =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption font-medium ring-1 ring-inset whitespace-nowrap";

export function InvoiceStatusBadge({
  status,
  className,
}: {
  status: InvoiceStatus;
  className?: string;
}) {
  const { label, icon: Icon, className: tone } = STATUS[status];
  return (
    <span className={cn(base, tone, className)}>
      <Icon className="size-3 shrink-0" aria-hidden />
      {label}
    </span>
  );
}

export function RiskBadge({
  risk,
  className,
  withLabel = true,
}: {
  risk: RiskLevel;
  className?: string;
  withLabel?: boolean;
}) {
  const { label, icon: Icon, className: tone } = RISK[risk];
  return (
    <span
      className={cn(base, tone, className)}
      title={withLabel ? undefined : `${label} risk`}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {withLabel ? label : <span className="sr-only">{label} risk</span>}
    </span>
  );
}

export function StageDot({ risk }: { risk: RiskLevel }) {
  return (
    <CircleDashed
      aria-hidden
      className={cn(
        "size-3",
        risk === "high"
          ? "text-danger"
          : risk === "medium"
            ? "text-warning"
            : "text-success",
      )}
    />
  );
}
