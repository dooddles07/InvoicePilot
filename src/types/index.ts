/**
 * Domain types.
 *
 * These mirror the FastAPI Pydantic schemas field-for-field (snake_case
 * included) so that replacing the local fixtures with `fetch()` is a swap of
 * the data source, not a rewrite of every component. Monetary values are
 * integer cents. Dates are ISO-8601 strings.
 */

export type UUID = string;
export type ISODate = string;

/* ---------- tenancy ---------- */

export interface Workspace {
  id: UUID;
  name: string;
  slug: string;
  plan: "starter" | "professional" | "scale";
  currency: "USD";
  created_at: ISODate;
}

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export interface User {
  id: UUID;
  email: string;
  full_name: string;
  avatar_url: string | null;
}

export interface WorkspaceMember {
  id: UUID;
  workspace_id: UUID;
  user: User;
  role: WorkspaceRole;
  status: "active" | "invited";
  last_active_at: ISODate | null;
}

/* ---------- customers ---------- */

export type RiskLevel = "low" | "medium" | "high";

export interface Customer {
  id: UUID;
  workspace_id: UUID;
  name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  industry: string;
  customer_since: ISODate;
  payment_terms_days: number;
  /** Derived server-side; the UI never recomputes these from the invoice list. */
  outstanding_cents: number;
  overdue_cents: number;
  total_invoiced_cents: number;
  avg_days_to_pay: number;
  on_time_rate: number;
  risk: RiskLevel;
  risk_reason: string;
  open_invoice_count: number;
}

/* ---------- invoices ---------- */

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "disputed";

export interface InvoiceItem {
  id: UUID;
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
}

export interface Invoice {
  id: UUID;
  workspace_id: UUID;
  number: string;
  customer_id: UUID;
  customer_name: string;
  status: InvoiceStatus;
  risk: RiskLevel;
  amount_cents: number;
  paid_cents: number;
  balance_cents: number;
  issue_date: ISODate;
  due_date: ISODate;
  paid_date: ISODate | null;
  /** Positive when past due, 0 or negative otherwise. */
  days_overdue: number;
  last_contacted_at: ISODate | null;
  next_action: string | null;
  po_number: string | null;
  notes: string | null;
  items: InvoiceItem[];
}

/* ---------- payments ---------- */

export type PaymentMethod =
  | "bank_transfer"
  | "card"
  | "ach"
  | "check"
  | "stripe"
  | "paypal";

export interface Payment {
  id: UUID;
  workspace_id: UUID;
  invoice_id: UUID;
  invoice_number: string;
  customer_id: UUID;
  customer_name: string;
  amount_cents: number;
  method: PaymentMethod;
  reference: string;
  received_at: ISODate;
}

/* ---------- collections ---------- */

export type CollectionStage =
  | "upcoming"
  | "due_today"
  | "late_1_30"
  | "late_31_60"
  | "late_60_plus";

export type CollectionEventType =
  | "invoice_sent"
  | "invoice_viewed"
  | "reminder_sent"
  | "escalation_sent"
  | "call_logged"
  | "note_added"
  | "payment_received"
  | "dispute_raised"
  | "automation_ran";

export interface CollectionEvent {
  id: UUID;
  workspace_id: UUID;
  invoice_id: UUID;
  customer_id: UUID;
  type: CollectionEventType;
  channel: "email" | "sms" | "phone" | "system" | null;
  summary: string;
  detail: string | null;
  actor: string;
  occurred_at: ISODate;
}

/* ---------- automations ---------- */

export type AutomationNodeType =
  | "trigger"
  | "delay"
  | "condition"
  | "email"
  | "sms"
  | "notification"
  | "webhook";

export interface AutomationNode {
  id: UUID;
  type: AutomationNodeType;
  title: string;
  detail: string;
  /** Condition nodes fan out; every other node has at most one next. */
  branches?: { label: string; nodes: AutomationNode[] }[];
}

export interface Automation {
  id: UUID;
  workspace_id: UUID;
  name: string;
  description: string;
  enabled: boolean;
  trigger_label: string;
  nodes: AutomationNode[];
  runs_30d: number;
  recovered_cents_30d: number;
  last_run_at: ISODate | null;
  created_at: ISODate;
}

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  trigger_label: string;
  nodes: AutomationNode[];
}

/* ---------- AI ---------- */

export type AIActionKind =
  | "send_reminder"
  | "send_escalation"
  | "schedule_call"
  | "flag_review";

export interface AIInsight {
  id: UUID;
  workspace_id: UUID;
  priority: number;
  customer_id: UUID;
  customer_name: string;
  invoice_id: UUID | null;
  amount_cents: number;
  headline: string;
  reasoning: string;
  recommended_action: string;
  action_kind: AIActionKind;
  confidence: number;
  created_at: ISODate;
}

export interface AIAnswerMetric {
  label: string;
  value: string;
  direction: "up" | "down" | "flat" | null;
}

export interface AIAnswerContributor {
  label: string;
  value_cents: number;
  share: number;
  href: string;
}

export interface AIAnswer {
  id: string;
  question: string;
  headline: string;
  detail: string;
  metrics: AIAnswerMetric[];
  contributors: AIAnswerContributor[];
  recommended_action: string;
  action_kind: AIActionKind;
  /** Every action is confirmed by a human before it executes. */
  requires_confirmation: true;
}

/* ---------- integrations ---------- */

export type IntegrationCategory =
  | "accounting"
  | "payments"
  | "communication"
  | "ecommerce"
  | "automation";

export interface Integration {
  id: string;
  workspace_id: UUID;
  name: string;
  category: IntegrationCategory;
  description: string;
  status: "connected" | "available" | "error";
  connected_at: ISODate | null;
  last_synced_at: ISODate | null;
}

/* ---------- reporting aggregates ---------- */

export interface KpiSummary {
  outstanding_cents: number;
  overdue_cents: number;
  collected_30d_cents: number;
  collection_rate: number;
  outstanding_change: number;
  overdue_change: number;
  collected_change: number;
  collection_rate_change: number;
  outstanding_trend: number[];
  overdue_trend: number[];
  collected_trend: number[];
  collection_rate_trend: number[];
}

export interface CashFlowPoint {
  date: ISODate;
  label: string;
  expected_cents: number;
  actual_cents: number;
  overdue_cents: number;
}

export type AgingBucketKey =
  | "current"
  | "1_30"
  | "31_60"
  | "61_90"
  | "90_plus";

export interface AgingBucket {
  key: AgingBucketKey;
  label: string;
  amount_cents: number;
  invoice_count: number;
  share: number;
}

export interface NeedsAttentionItem {
  invoice_id: UUID;
  invoice_number: string;
  customer_id: UUID;
  customer_name: string;
  balance_cents: number;
  days_overdue: number;
  risk: RiskLevel;
  recommended_action: string;
  ai_note: string | null;
}

export interface AuditLogEntry {
  id: UUID;
  workspace_id: UUID;
  actor: string;
  action: string;
  target: string;
  ip: string;
  occurred_at: ISODate;
}

export interface UsageMeter {
  label: string;
  used: number;
  limit: number;
}

/* ---------- settings ---------- */

export interface EmailTemplate {
  id: UUID;
  workspace_id: UUID;
  name: string;
  subject: string;
  body: string;
  used_by: string[];
  updated_at: ISODate;
}

export interface ApiKey {
  id: UUID;
  workspace_id: UUID;
  name: string;
  /** Only the last four characters are ever returned by the API. */
  last_four: string;
  scopes: ("read" | "write")[];
  created_at: ISODate;
  last_used_at: ISODate | null;
}

export interface WebhookEndpoint {
  id: UUID;
  workspace_id: UUID;
  url: string;
  events: string[];
  status: "active" | "failing" | "paused";
  last_delivery_at: ISODate | null;
  failure_count: number;
}

export interface NotificationPreference {
  id: string;
  label: string;
  description: string;
  email: boolean;
  in_app: boolean;
}

export interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  question: string;
  cadence: "on demand" | "weekly" | "monthly";
}
