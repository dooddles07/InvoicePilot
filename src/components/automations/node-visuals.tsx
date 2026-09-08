import {
  Bell,
  Clock,
  GitBranch,
  Mail,
  MessageSquare,
  Webhook,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { AutomationNodeType } from "@/types";

/**
 * Node type is carried by an icon and a word, and tinted with design tokens
 * rather than raw palette classes — so the builder re-themes with the rest of
 * the app instead of staying light-mode emerald forever.
 */
export const NODE_VISUAL: Record<
  AutomationNodeType,
  { label: string; icon: LucideIcon; tile: string; ring: string }
> = {
  trigger: {
    label: "Trigger",
    icon: Zap,
    tile: "bg-brand-muted text-brand",
    ring: "ring-brand/30",
  },
  delay: {
    label: "Delay",
    icon: Clock,
    tile: "bg-muted text-muted-foreground",
    ring: "ring-border",
  },
  condition: {
    label: "Condition",
    icon: GitBranch,
    tile: "bg-warning-muted text-warning",
    ring: "ring-warning/30",
  },
  email: {
    label: "Email",
    icon: Mail,
    tile: "bg-success-muted text-success",
    ring: "ring-success/30",
  },
  sms: {
    label: "SMS",
    icon: MessageSquare,
    tile: "bg-success-muted text-success",
    ring: "ring-success/30",
  },
  notification: {
    label: "Notification",
    icon: Bell,
    tile: "bg-brand-muted text-brand",
    ring: "ring-brand/30",
  },
  webhook: {
    label: "Webhook",
    icon: Webhook,
    tile: "bg-muted text-foreground",
    ring: "ring-border",
  },
};
