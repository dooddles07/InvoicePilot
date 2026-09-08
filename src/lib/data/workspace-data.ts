import type {
  ApiKey,
  AuditLogEntry,
  AutomationNode,
  AutomationTemplate,
  EmailTemplate,
  NotificationPreference,
  ReportDefinition,
  WebhookEndpoint,
} from "@/types";
import { NOW, workspace } from "./seed";

/**
 * Workspace configuration: automation templates, settings records and report
 * definitions. Kept apart from `seed.ts` because none of it is derived from
 * the invoice ledger — it is the shape of the product, not the shape of the
 * demo company's book.
 */

const MS_DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * MS_DAY).toISOString();

let seq = 0;
const id = (prefix: string) => `${prefix}_${(++seq).toString(36).padStart(4, "0")}`;

const node = (
  type: AutomationNode["type"],
  title: string,
  detail: string,
  branches?: AutomationNode["branches"],
): AutomationNode => ({ id: id("nd"), type, title, detail, branches });

/* ------------------------------------------------------------------ */
/* Automation templates                                                */
/* ------------------------------------------------------------------ */

export const automationTemplates: AutomationTemplate[] = [
  {
    id: "friendly-reminder",
    name: "Friendly Payment Reminder",
    description:
      "The everyday workhorse. Nudges the customer the day after an invoice falls overdue, then follows up once if it is still unpaid.",
    trigger_label: "Invoice becomes overdue",
    nodes: [
      node("trigger", "Invoice becomes overdue", "Any invoice, any amount"),
      node("delay", "Wait 1 day", "Business days only"),
      node("email", "Send friendly email", "Template: Gentle nudge"),
      node("delay", "Wait 3 days", "Business days only"),
      node("condition", "Check payment status", "Has the balance been settled?", [
        {
          label: "Paid",
          nodes: [node("notification", "Close the loop", "Notify owner, stop sequence")],
        },
        {
          label: "Still unpaid",
          nodes: [
            node("email", "Send second reminder", "Template: Firmer follow-up"),
            node("notification", "Notify finance manager", "In-app + daily digest"),
          ],
        },
      ]),
    ],
  },
  {
    id: "upcoming-reminder",
    name: "Upcoming Payment Reminder",
    description:
      "The cheapest collection is the one you never have to make. Reminds the customer three days before the due date.",
    trigger_label: "3 days before due date",
    nodes: [
      node("trigger", "3 days before due date", "Status is Sent or Viewed"),
      node("email", "Send courtesy reminder", "Template: Upcoming payment"),
    ],
  },
  {
    id: "second-reminder",
    name: "Second Reminder",
    description:
      "For invoices that survived the first nudge. Firmer wording, and it asks for a payment date rather than just a payment.",
    trigger_label: "Invoice 7 days overdue",
    nodes: [
      node("trigger", "Invoice 7 days overdue", "No payment recorded"),
      node("email", "Send firmer follow-up", "Template: Confirm a payment date"),
      node("delay", "Wait 5 days", "Business days only"),
      node("condition", "Any reply?", "Has the customer responded?", [
        {
          label: "Replied",
          nodes: [node("notification", "Hand to a human", "Assign to the account owner")],
        },
        {
          label: "Silence",
          nodes: [node("notification", "Flag for escalation", "Adds to the collections queue")],
        },
      ]),
    ],
  },
  {
    id: "escalation",
    name: "Escalation",
    description:
      "Past 30 days, email alone stops working. Escalates to a named contact and puts a human on the account.",
    trigger_label: "Invoice 30 days overdue",
    nodes: [
      node("trigger", "Invoice 30 days overdue", "Balance above $1,000"),
      node("email", "Send escalation notice", "Template: Formal escalation"),
      node("sms", "Text the AP contact", "Only if a mobile number exists"),
      node("notification", "Alert account owner", "In-app, high priority"),
    ],
  },
  {
    id: "high-value-alert",
    name: "High-Value Invoice Alert",
    description:
      "Large invoices deserve eyes from day one. Flags anything above $10,000 the moment it is issued.",
    trigger_label: "Invoice > $10,000",
    nodes: [
      node("trigger", "Invoice above $10,000 issued", "Any customer"),
      node("notification", "Notify finance manager", "In-app + email"),
      node("webhook", "Post to finance channel", "Slack incoming webhook"),
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export const reportDefinitions: ReportDefinition[] = [
  {
    id: "aging",
    name: "Accounts receivable aging",
    description: "Open balance split across current, 1–30, 31–60, 61–90 and 90+ days.",
    question: "How old is the money I am owed?",
    cadence: "weekly",
  },
  {
    id: "collection-rate",
    name: "Collection rate",
    description: "Share of invoiced value settled, measured on windows that have had time to settle.",
    question: "Of what fell due, how much did we actually collect?",
    cadence: "monthly",
  },
  {
    id: "payment-performance",
    name: "Payment performance",
    description: "Days-to-pay distribution against agreed terms, by customer and by month.",
    question: "Who pays on time, and who never does?",
    cadence: "monthly",
  },
  {
    id: "customer-risk",
    name: "Customer risk",
    description: "Risk grade per account with the driver behind it and the exposure at stake.",
    question: "Which accounts could cost me money?",
    cadence: "weekly",
  },
  {
    id: "revenue-collection",
    name: "Revenue collection",
    description: "Invoiced against collected over time, with the gap that is still outstanding.",
    question: "How much of what I billed has turned into cash?",
    cadence: "monthly",
  },
  {
    id: "overdue-trends",
    name: "Overdue trends",
    description: "Movement in overdue balance and count, with the accounts driving the change.",
    question: "Is my overdue balance getting better or worse?",
    cadence: "weekly",
  },
  {
    id: "days-to-payment",
    name: "Average days to payment",
    description: "Mean and median days from issue to settlement, trended and segmented.",
    question: "How long does my cash actually take to arrive?",
    cadence: "monthly",
  },
];

/* ------------------------------------------------------------------ */
/* Settings records                                                    */
/* ------------------------------------------------------------------ */

export const emailTemplates: EmailTemplate[] = [
  {
    id: id("tpl"),
    workspace_id: workspace.id,
    name: "Gentle nudge",
    subject: "Invoice {{invoice_number}} — a quick reminder",
    body: "Hi {{contact_first_name}},\n\nJust a quick note that invoice {{invoice_number}} for {{balance}} became due {{days_overdue}} days ago. If it is already scheduled, please ignore this.\n\n{{payment_link}}",
    used_by: ["Friendly Payment Reminder"],
    updated_at: daysAgo(42),
  },
  {
    id: id("tpl"),
    workspace_id: workspace.id,
    name: "Upcoming payment",
    subject: "Invoice {{invoice_number}} is due on {{due_date}}",
    body: "Hi {{contact_first_name}},\n\nInvoice {{invoice_number}} for {{balance}} falls due on {{due_date}}. No action needed if it is already in your payment run.\n\n{{payment_link}}",
    used_by: ["Upcoming Payment Reminder"],
    updated_at: daysAgo(63),
  },
  {
    id: id("tpl"),
    workspace_id: workspace.id,
    name: "Confirm a payment date",
    subject: "Invoice {{invoice_number}} — can you confirm a date?",
    body: "Hi {{contact_first_name}},\n\nInvoice {{invoice_number}} for {{balance}} is now {{days_overdue}} days past due. Could you confirm a payment date, or tell me what is holding it up?",
    used_by: ["Second Reminder"],
    updated_at: daysAgo(21),
  },
  {
    id: id("tpl"),
    workspace_id: workspace.id,
    name: "Formal escalation",
    subject: "Overdue account: invoice {{invoice_number}}",
    body: "Hi {{contact_first_name}},\n\nDespite previous reminders, invoice {{invoice_number}} for {{balance}} remains unpaid {{days_overdue}} days after its due date. Please arrange payment within five working days or contact us to agree a plan.",
    used_by: ["Escalation"],
    updated_at: daysAgo(9),
  },
];

export const apiKeys: ApiKey[] = [
  {
    id: id("key"),
    workspace_id: workspace.id,
    name: "Production server",
    last_four: "8f21",
    scopes: ["read", "write"],
    created_at: daysAgo(214),
    last_used_at: daysAgo(0),
  },
  {
    id: id("key"),
    workspace_id: workspace.id,
    name: "Looker reporting",
    last_four: "c40d",
    scopes: ["read"],
    created_at: daysAgo(96),
    last_used_at: daysAgo(1),
  },
  {
    id: id("key"),
    workspace_id: workspace.id,
    name: "Staging sandbox",
    last_four: "1a77",
    scopes: ["read", "write"],
    created_at: daysAgo(31),
    last_used_at: null,
  },
];

export const webhookEndpoints: WebhookEndpoint[] = [
  {
    id: id("whk"),
    workspace_id: workspace.id,
    url: "https://ops.meridianstudio.com/hooks/invoicepilot",
    events: ["invoice.overdue", "payment.received", "automation.completed"],
    status: "active",
    last_delivery_at: daysAgo(0),
    failure_count: 0,
  },
  {
    id: id("whk"),
    workspace_id: workspace.id,
    url: "https://hooks.slack.com/services/T0/B0/finance",
    events: ["invoice.high_value"],
    status: "failing",
    last_delivery_at: daysAgo(2),
    failure_count: 14,
  },
];

export const notificationPreferences: NotificationPreference[] = [
  {
    id: "invoice_overdue",
    label: "Invoice becomes overdue",
    description: "The moment an invoice passes its due date.",
    email: true,
    in_app: true,
  },
  {
    id: "payment_received",
    label: "Payment received",
    description: "Any payment recorded against an open invoice.",
    email: false,
    in_app: true,
  },
  {
    id: "high_value",
    label: "High-value invoice issued",
    description: "Invoices above $10,000, so large exposure is never unwatched.",
    email: true,
    in_app: true,
  },
  {
    id: "dispute",
    label: "Dispute raised",
    description: "A customer queries an invoice. Reminders pause automatically.",
    email: true,
    in_app: true,
  },
  {
    id: "digest",
    label: "Daily collections digest",
    description: "One summary each morning of what needs chasing.",
    email: true,
    in_app: false,
  },
  {
    id: "automation_failed",
    label: "Automation failed",
    description: "A step could not run — a bounced address, a dead webhook.",
    email: true,
    in_app: true,
  },
];

const AUDIT_ACTIONS: [string, string, string][] = [
  ["Alex Mercer", "Sent payment reminder", "INV-2026-00616 · Marlowe Publishing"],
  ["Priya Raman", "Recorded payment", "INV-2026-00834 · Nova Digital · $6,800.00"],
  ["InvoicePilot", "Automation ran", "Friendly Payment Reminder · 12 invoices"],
  ["Tom Okafor", "Updated customer", "Acme Corporation · payment terms 30 → 45 days"],
  ["Alex Mercer", "Created API key", "Staging sandbox · read, write"],
  ["Priya Raman", "Exported report", "Accounts receivable aging · CSV"],
  ["Alex Mercer", "Invited team member", "lena.fischer@meridianstudio.com · viewer"],
  ["InvoicePilot", "Webhook delivery failed", "hooks.slack.com · invoice.high_value"],
  ["Tom Okafor", "Marked invoice disputed", "INV-2026-00620 · Acme Corporation"],
  ["Alex Mercer", "Connected integration", "QuickBooks · full sync enabled"],
  ["Priya Raman", "Edited email template", "Formal escalation"],
  ["Alex Mercer", "Changed plan", "Starter → Professional"],
];

export const auditLogs: AuditLogEntry[] = AUDIT_ACTIONS.map(
  ([actor, action, target], i) => ({
    id: id("aud"),
    workspace_id: workspace.id,
    actor,
    action,
    target,
    ip: `203.0.113.${20 + i}`,
    occurred_at: daysAgo(i * 0.6),
  }),
);
