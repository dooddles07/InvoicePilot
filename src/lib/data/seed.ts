import type {
  Automation,
  CollectionEvent,
  CollectionEventType,
  Customer,
  Integration,
  Invoice,
  InvoiceItem,
  Payment,
  PaymentMethod,
  RiskLevel,
  User,
  Workspace,
  WorkspaceMember,
} from "@/types";

/**
 * Deterministic demo dataset.
 *
 * Every figure the UI shows is *derived* from this one invoice ledger — KPIs,
 * aging buckets, chart series and customer stats are all computed, never
 * hand-typed. That is what makes the mockup internally consistent: change one
 * invoice and the dashboard moves with it, exactly like the real product.
 *
 * A fixed reference date keeps server and client renders identical (no
 * hydration drift) and keeps screenshots reproducible.
 */

export const NOW = new Date("2026-09-08T09:12:00.000Z");

const MS_DAY = 86_400_000;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(0x1_9f0c);

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
const intBetween = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));
const iso = (d: Date) => d.toISOString();
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * MS_DAY);
const dayDiff = (a: Date, b: Date) =>
  Math.floor((a.getTime() - b.getTime()) / MS_DAY);

let idCounter = 0;
const id = (prefix: string) =>
  `${prefix}_${(++idCounter).toString(36).padStart(6, "0")}`;

/* ------------------------------------------------------------------ */
/* Tenant                                                              */
/* ------------------------------------------------------------------ */

export const workspace: Workspace = {
  id: "ws_meridian",
  name: "Meridian Studio",
  slug: "meridian-studio",
  plan: "professional",
  currency: "USD",
  created_at: "2024-02-11T10:00:00.000Z",
};

export const workspaces: Workspace[] = [
  workspace,
  {
    id: "ws_harbor",
    name: "Harbor Fabrication",
    slug: "harbor-fabrication",
    plan: "starter",
    currency: "USD",
    created_at: "2025-06-03T10:00:00.000Z",
  },
  {
    id: "ws_lattice",
    name: "Lattice Group",
    slug: "lattice-group",
    plan: "scale",
    currency: "USD",
    created_at: "2023-11-20T10:00:00.000Z",
  },
];

export const currentUser: User = {
  id: "usr_alex",
  email: "alex.mercer@meridianstudio.com",
  full_name: "Alex Mercer",
  avatar_url: null,
};

export const teamMembers: WorkspaceMember[] = [
  {
    id: id("mem"),
    workspace_id: workspace.id,
    user: currentUser,
    role: "owner",
    status: "active",
    last_active_at: iso(addDays(NOW, 0)),
  },
  {
    id: id("mem"),
    workspace_id: workspace.id,
    user: {
      id: "usr_priya",
      email: "priya.raman@meridianstudio.com",
      full_name: "Priya Raman",
      avatar_url: null,
    },
    role: "admin",
    status: "active",
    last_active_at: iso(addDays(NOW, -1)),
  },
  {
    id: id("mem"),
    workspace_id: workspace.id,
    user: {
      id: "usr_tom",
      email: "tom.okafor@meridianstudio.com",
      full_name: "Tom Okafor",
      avatar_url: null,
    },
    role: "member",
    status: "active",
    last_active_at: iso(addDays(NOW, -3)),
  },
  {
    id: id("mem"),
    workspace_id: workspace.id,
    user: {
      id: "usr_lena",
      email: "lena.fischer@meridianstudio.com",
      full_name: "Lena Fischer",
      avatar_url: null,
    },
    role: "viewer",
    status: "invited",
    last_active_at: null,
  },
];

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

type CustomerSeed = {
  name: string;
  industry: string;
  contact: string;
  domain: string;
  /** 0 = chronically late, 1 = always early. Drives every derived stat. */
  reliability: number;
  /** Typical invoice size in dollars. */
  size: number;
  terms: number;
  /** Negative means behaviour has worsened over the last quarter. */
  trend: number;
};

const CUSTOMER_SEEDS: CustomerSeed[] = [
  { name: "Acme Corporation", industry: "Manufacturing", contact: "Dana Whitfield", domain: "acmecorp.com", reliability: 0.34, size: 9200, terms: 30, trend: -0.28 },
  { name: "Northstar Consulting", industry: "Professional Services", contact: "Miles Rutherford", domain: "northstar-consulting.com", reliability: 0.41, size: 6400, terms: 30, trend: -0.19 },
  { name: "Brightline Studio", industry: "Creative Agency", contact: "Yuki Tanaka", domain: "brightlinestudio.com", reliability: 0.62, size: 4800, terms: 14, trend: -0.06 },
  { name: "Vertex Logistics", industry: "Logistics", contact: "Carla Mendes", domain: "vertexlogistics.com", reliability: 0.78, size: 15400, terms: 45, trend: 0.04 },
  { name: "Summit Construction", industry: "Construction", contact: "Raymond Ellis", domain: "summitconstruction.com", reliability: 0.52, size: 22800, terms: 45, trend: -0.11 },
  { name: "Nova Digital", industry: "Software", contact: "Ingrid Solberg", domain: "novadigital.io", reliability: 0.88, size: 5200, terms: 14, trend: 0.07 },
  { name: "Halden & Reeve", industry: "Legal", contact: "Beatrice Halden", domain: "haldenreeve.com", reliability: 0.91, size: 11200, terms: 30, trend: 0.02 },
  { name: "Portside Freight", industry: "Logistics", contact: "Omar Haddad", domain: "portsidefreight.com", reliability: 0.47, size: 18600, terms: 60, trend: -0.14 },
  { name: "Cedarwood Interiors", industry: "Design & Build", contact: "Marta Kovač", domain: "cedarwoodinteriors.com", reliability: 0.71, size: 7400, terms: 30, trend: 0.01 },
  { name: "Ironvale Engineering", industry: "Engineering", contact: "Douglas Pryce", domain: "ironvale-eng.com", reliability: 0.66, size: 26400, terms: 45, trend: -0.03 },
  { name: "Willowbrook Health", industry: "Healthcare", contact: "Adaeze Nwosu", domain: "willowbrookhealth.org", reliability: 0.83, size: 13800, terms: 30, trend: 0.05 },
  { name: "Peregrine Analytics", industry: "Data & Analytics", contact: "Sven Lindqvist", domain: "peregrineanalytics.com", reliability: 0.86, size: 8900, terms: 14, trend: 0.03 },
  { name: "Kestrel Media Group", industry: "Media", contact: "Rosalind Achebe", domain: "kestrelmedia.com", reliability: 0.58, size: 6100, terms: 30, trend: -0.09 },
  { name: "Bluepeak Ventures", industry: "Finance", contact: "Julian Voss", domain: "bluepeakventures.com", reliability: 0.94, size: 19200, terms: 14, trend: 0.06 },
  { name: "Thornbury Retail", industry: "Retail", contact: "Fiona Marsh", domain: "thornburyretail.com", reliability: 0.55, size: 4200, terms: 30, trend: -0.16 },
  { name: "Granite Peak Supply", industry: "Wholesale", contact: "Hector Alvarez", domain: "granitepeaksupply.com", reliability: 0.69, size: 16800, terms: 45, trend: -0.02 },
  { name: "Lumen Architects", industry: "Architecture", contact: "Nadia Farouk", domain: "lumenarchitects.com", reliability: 0.74, size: 12400, terms: 30, trend: 0.0 },
  { name: "Redwood Provisions", industry: "Food & Beverage", contact: "Callum Doyle", domain: "redwoodprovisions.com", reliability: 0.63, size: 3600, terms: 14, trend: -0.05 },
  { name: "Atlas Fabrication", industry: "Manufacturing", contact: "Greta Lindholm", domain: "atlasfab.com", reliability: 0.49, size: 20400, terms: 60, trend: -0.21 },
  { name: "Silverline Insurance", industry: "Insurance", contact: "Patrick Nolan", domain: "silverlineins.com", reliability: 0.9, size: 14600, terms: 30, trend: 0.04 },
  { name: "Copperfield Labs", industry: "Biotech", contact: "Ana Beltrán", domain: "copperfieldlabs.com", reliability: 0.81, size: 24800, terms: 45, trend: 0.02 },
  { name: "Marlowe Publishing", industry: "Publishing", contact: "Edith Cranfield", domain: "marlowepublishing.com", reliability: 0.72, size: 5600, terms: 30, trend: -0.01 },
  { name: "Fenwick Property Group", industry: "Real Estate", contact: "Samuel Okonjo", domain: "fenwickproperty.com", reliability: 0.57, size: 28600, terms: 60, trend: -0.12 },
  { name: "Harborview Hotels", industry: "Hospitality", contact: "Renata Oliveira", domain: "harborviewhotels.com", reliability: 0.64, size: 17200, terms: 45, trend: -0.07 },
  { name: "Quantum Print Works", industry: "Printing", contact: "Tobias Wren", domain: "quantumprintworks.com", reliability: 0.6, size: 3100, terms: 14, trend: 0.0 },
  { name: "Everline Telecom", industry: "Telecommunications", contact: "Simone Duval", domain: "everlinetelecom.com", reliability: 0.85, size: 21400, terms: 30, trend: 0.03 },
  { name: "Bramble & Hart", industry: "Consulting", contact: "Owen Bramble", domain: "brambleandhart.com", reliability: 0.76, size: 9800, terms: 30, trend: 0.01 },
  { name: "Sable Ridge Energy", industry: "Energy", contact: "Priya Deshmukh", domain: "sableridgeenergy.com", reliability: 0.7, size: 32400, terms: 45, trend: -0.04 },
  { name: "Kingfisher Marine", industry: "Marine Services", contact: "Angus MacLeod", domain: "kingfishermarine.com", reliability: 0.53, size: 11800, terms: 45, trend: -0.15 },
  { name: "Auberon Textiles", industry: "Textiles", contact: "Leila Naderi", domain: "auberontextiles.com", reliability: 0.67, size: 7900, terms: 30, trend: -0.02 },
  { name: "Pinnacle Dental Group", industry: "Healthcare", contact: "Marcus Aleman", domain: "pinnacledental.com", reliability: 0.87, size: 6700, terms: 14, trend: 0.05 },
  { name: "Westgate Security", industry: "Security Services", contact: "Deborah Quinn", domain: "westgatesecurity.com", reliability: 0.79, size: 10400, terms: 30, trend: 0.02 },
  { name: "Orchard Lane Foods", industry: "Food & Beverage", contact: "Tomás Ferreira", domain: "orchardlanefoods.com", reliability: 0.61, size: 8300, terms: 30, trend: -0.08 },
  { name: "Delmar Aviation", industry: "Aviation", contact: "Céline Rousseau", domain: "delmaraviation.com", reliability: 0.75, size: 36800, terms: 60, trend: 0.0 },
  { name: "Ashcroft Financial", industry: "Finance", contact: "Nigel Ashcroft", domain: "ashcroftfinancial.com", reliability: 0.92, size: 15900, terms: 14, trend: 0.04 },
  { name: "Verdant Landscapes", industry: "Landscaping", contact: "Isabel Moreno", domain: "verdantlandscapes.com", reliability: 0.56, size: 5400, terms: 30, trend: -0.1 },
  { name: "Stonebridge Academy", industry: "Education", contact: "Harriet Blythe", domain: "stonebridgeacademy.edu", reliability: 0.84, size: 12900, terms: 45, trend: 0.01 },
  { name: "Tessera Software", industry: "Software", contact: "Rui Nakamura", domain: "tessera.dev", reliability: 0.89, size: 7200, terms: 14, trend: 0.06 },
  { name: "Ravenswood Brewing", industry: "Food & Beverage", contact: "Gabriel Stokes", domain: "ravenswoodbrewing.com", reliability: 0.59, size: 4600, terms: 30, trend: -0.06 },
  { name: "Meridian Freight Lines", industry: "Logistics", contact: "Aisha Bello", domain: "meridianfreightlines.com", reliability: 0.68, size: 19800, terms: 45, trend: -0.03 },
];

const LINE_ITEMS: Record<string, string[]> = {
  default: [
    "Professional services retainer",
    "Project delivery milestone",
    "Consulting hours",
    "Account management",
  ],
  Manufacturing: ["Tooling and setup", "Production run", "Quality inspection", "Materials handling"],
  Logistics: ["Freight forwarding", "Warehousing (monthly)", "Last-mile delivery", "Customs brokerage"],
  Construction: ["Site preparation", "Structural works progress claim", "Fit-out labour", "Materials supply"],
  Software: ["Platform licence (annual)", "Implementation services", "Priority support tier", "Custom integration"],
  Healthcare: ["Clinical services", "Equipment servicing", "Compliance audit", "Staff training programme"],
  "Creative Agency": ["Brand identity phase", "Campaign production", "Content retainer", "Motion design"],
};

const linePool = (industry: string) => LINE_ITEMS[industry] ?? LINE_ITEMS.default!;

/* ------------------------------------------------------------------ */
/* Invoice ledger                                                      */
/* ------------------------------------------------------------------ */

const INVOICE_COUNT = 460;
const LEDGER_START_DAYS = 430;
/** Meridian is an SMB agency, not an enterprise: invoices are thousands, not millions. */
const SIZE_SCALE = 0.12;
/** Beyond this age a stubborn invoice has either been settled or written off. */
const DELINQUENCY_HORIZON_DAYS = 210;

type Draft = {
  seed: CustomerSeed;
  customerId: string;
  issue: Date;
  due: Date;
  paid: Date | null;
  amountCents: number;
  paidCents: number;
  status: Invoice["status"];
};

const customerIds = CUSTOMER_SEEDS.map(() => id("cus"));

function amountFor(seed: CustomerSeed): number {
  // Log-ish spread around the customer's typical size, rounded to a
  // believable invoice figure rather than a random cent value.
  const factor = Math.exp(between(-0.55, 0.6));
  const dollars = seed.size * SIZE_SCALE * factor;
  const rounded = Math.round(dollars / 10) * 10;
  return Math.max(48000, rounded * 100);
}

/** Days after the due date this customer actually pays. */
function settlementDelay(seed: CustomerSeed, ageDays: number): number {
  // Behaviour drifts over time: `trend` moves recent invoices later/earlier.
  const recency = 1 - Math.min(ageDays / LEDGER_START_DAYS, 1);
  const drift = -seed.trend * 18 * recency;
  // Reliable accounts genuinely pay early; the offset is what makes on-time
  // rate a meaningful statistic rather than noise around the due date.
  const base = (1 - seed.reliability) * 40 - 14;
  return Math.round(base + drift + between(-4, 6));
}

/**
 * Some invoices simply never get settled inside the horizon. Without this the
 * ledger self-cleans — every old invoice ends up paid and the aging report has
 * nothing past 30 days, which is not what a real collections book looks like.
 */
function isDelinquent(seed: CustomerSeed, ageDays: number): boolean {
  if (ageDays > DELINQUENCY_HORIZON_DAYS) return false;
  return rnd() < (1 - seed.reliability) * 0.34;
}

const drafts: Draft[] = [];

for (let i = 0; i < INVOICE_COUNT; i++) {
  // Weight selection so a handful of accounts dominate the ledger, as in a
  // real book of business.
  const weighted = Math.floor(Math.pow(rnd(), 1.55) * CUSTOMER_SEEDS.length);
  const seed = CUSTOMER_SEEDS[weighted]!;
  const customerId = customerIds[weighted]!;

  // Even spread across the ledger window: a steady book, so month-on-month
  // comparisons reflect collection behaviour rather than a growth curve.
  const ageDays = Math.round(rnd() * LEDGER_START_DAYS);
  const issue = addDays(NOW, -ageDays);
  const due = addDays(issue, seed.terms);
  const amountCents = amountFor(seed);

  const delay = settlementDelay(seed, ageDays);
  const settled = isDelinquent(seed, ageDays)
    ? addDays(NOW, 3650) // still unsettled at the end of the horizon
    : addDays(due, delay);

  let status: Invoice["status"];
  let paid: Date | null = null;
  let paidCents = 0;

  if (settled <= NOW) {
    status = "paid";
    paid = settled;
    paidCents = amountCents;
  } else if (due < NOW) {
    // Still open past the due date.
    const roll = rnd();
    if (roll < 0.08) {
      status = "disputed";
    } else if (roll < 0.2) {
      status = "partially_paid";
      paidCents = Math.round(amountCents * between(0.25, 0.6) / 1000) * 1000;
    } else {
      status = "overdue";
    }
  } else {
    const roll = rnd();
    status = roll < 0.12 ? "draft" : roll < 0.55 ? "sent" : "viewed";
  }

  drafts.push({ seed, customerId, issue, due, paid, amountCents, paidCents, status });
}

// Overdue invoices are the product's subject matter: guarantee a spread across
// every aging bucket so the collections pipeline is never lopsided.
drafts.sort((a, b) => a.issue.getTime() - b.issue.getTime());

let invoiceSeq = 380;
const yearOf = (d: Date) => d.getUTCFullYear();

export const invoices: Invoice[] = drafts.map((d) => {
  const invoiceId = id("inv");
  // Negative until the due date passes, so "upcoming" is a real state rather
  // than a bucket that can never be reached.
  const daysOverdue = d.status === "paid" ? 0 : dayDiff(NOW, d.due);
  const balance = d.amountCents - d.paidCents;

  const itemCount = intBetween(1, 4);
  const pool = linePool(d.seed.industry);
  const items: InvoiceItem[] = [];
  let remaining = d.amountCents;
  for (let i = 0; i < itemCount; i++) {
    const last = i === itemCount - 1;
    const share = last ? remaining : Math.round((remaining * between(0.25, 0.6)) / 100) * 100;
    remaining -= share;
    const quantity = intBetween(1, 12);
    items.push({
      id: id("itm"),
      description: pool[i % pool.length]!,
      quantity,
      unit_price_cents: Math.round(share / quantity),
      amount_cents: share,
    });
  }

  const risk: RiskLevel =
    daysOverdue > 45 || (daysOverdue > 20 && d.seed.reliability < 0.6)
      ? "high"
      : daysOverdue > 0 || d.seed.reliability < 0.62
        ? "medium"
        : "low";

  const lastContact =
    daysOverdue > 3 ? addDays(NOW, -intBetween(1, Math.min(daysOverdue, 21))) : null;

  return {
    id: invoiceId,
    workspace_id: workspace.id,
    number: `INV-${yearOf(d.issue)}-${String(++invoiceSeq).padStart(5, "0")}`,
    customer_id: d.customerId,
    customer_name: d.seed.name,
    status: d.status,
    risk,
    amount_cents: d.amountCents,
    paid_cents: d.paidCents,
    balance_cents: d.status === "paid" ? 0 : balance,
    issue_date: iso(d.issue),
    due_date: iso(d.due),
    paid_date: d.paid ? iso(d.paid) : null,
    days_overdue: daysOverdue,
    last_contacted_at: lastContact ? iso(lastContact) : null,
    next_action:
      d.status === "disputed"
        ? "Resolve dispute"
        : daysOverdue > 45
          ? "Escalate to phone call"
          : daysOverdue > 14
            ? "Send second reminder"
            : daysOverdue > 0
              ? "Send friendly reminder"
              : null,
    po_number: rnd() < 0.45 ? `PO-${intBetween(10000, 99999)}` : null,
    notes: null,
    items,
  } satisfies Invoice;
});

/* ------------------------------------------------------------------ */
/* Customers, derived from the ledger                                  */
/* ------------------------------------------------------------------ */

export const customers: Customer[] = CUSTOMER_SEEDS.map((seed, i) => {
  const cid = customerIds[i]!;
  const mine = invoices.filter((inv) => inv.customer_id === cid);
  const paid = mine.filter((inv) => inv.status === "paid" && inv.paid_date);

  const outstanding = mine
    .filter((inv) => inv.status !== "paid" && inv.status !== "draft")
    .reduce((s, inv) => s + inv.balance_cents, 0);
  const overdue = mine
    .filter((inv) => inv.days_overdue > 0 && inv.status !== "paid")
    .reduce((s, inv) => s + inv.balance_cents, 0);
  const totalInvoiced = mine.reduce((s, inv) => s + inv.amount_cents, 0);

  const delays = paid.map((inv) =>
    dayDiff(new Date(inv.paid_date!), new Date(inv.issue_date)),
  );
  const avgDaysToPay = delays.length
    ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length)
    : seed.terms;

  const onTime = paid.filter(
    (inv) => new Date(inv.paid_date!) <= new Date(inv.due_date),
  ).length;
  const onTimeRate = paid.length ? Math.round((onTime / paid.length) * 100) : 100;

  const worstOverdue = Math.max(0, ...mine.map((inv) => inv.days_overdue));
  const risk: RiskLevel =
    onTimeRate < 45 || worstOverdue > 60
      ? "high"
      : onTimeRate < 75 || worstOverdue > 5
        ? "medium"
        : "low";

  const riskReason =
    risk === "high"
      ? seed.trend < -0.12
        ? "Payment behaviour has deteriorated over the last 3 months and the oldest balance is past 45 days."
        : "Consistently settles well beyond terms; a large balance is currently past 45 days."
      : risk === "medium"
        ? seed.trend < -0.05
          ? "Still paying, but average days-to-pay has crept up since the last quarter."
          : "Occasionally settles after terms; balance is aging but recoverable."
        : "Settles on or before terms with no material aging.";

  return {
    id: cid,
    workspace_id: workspace.id,
    name: seed.name,
    contact_name: seed.contact,
    email: `${seed.contact.split(" ")[0]!.toLowerCase()}@${seed.domain}`,
    phone: `+1 (${intBetween(201, 989)}) ${intBetween(200, 999)}-${String(intBetween(1000, 9999))}`,
    industry: seed.industry,
    customer_since: iso(
      addDays(NOW, -intBetween(LEDGER_START_DAYS, LEDGER_START_DAYS + 900)),
    ),
    payment_terms_days: seed.terms,
    outstanding_cents: outstanding,
    overdue_cents: overdue,
    total_invoiced_cents: totalInvoiced,
    avg_days_to_pay: avgDaysToPay,
    on_time_rate: onTimeRate,
    risk,
    risk_reason: riskReason,
    open_invoice_count: mine.filter((inv) => inv.status !== "paid").length,
  } satisfies Customer;
});

export const customerById = new Map(customers.map((c) => [c.id, c]));

/* ------------------------------------------------------------------ */
/* Payments, derived from settled invoices                             */
/* ------------------------------------------------------------------ */

const METHODS: PaymentMethod[] = [
  "bank_transfer",
  "ach",
  "card",
  "stripe",
  "check",
  "paypal",
];

export const payments: Payment[] = invoices
  .filter((inv) => inv.paid_cents > 0)
  .map((inv) => ({
    id: id("pay"),
    workspace_id: workspace.id,
    invoice_id: inv.id,
    invoice_number: inv.number,
    customer_id: inv.customer_id,
    customer_name: inv.customer_name,
    amount_cents: inv.paid_cents,
    method: pick(METHODS),
    reference: `${pick(["TXN", "REF", "BAT"])}-${intBetween(100000, 999999)}`,
    received_at: inv.paid_date ?? iso(addDays(NOW, -intBetween(1, 20))),
  }))
  .sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at));

/* ------------------------------------------------------------------ */
/* Collection activity                                                 */
/* ------------------------------------------------------------------ */

const EVENT_COPY: Record<CollectionEventType, string> = {
  invoice_sent: "Invoice sent",
  invoice_viewed: "Invoice viewed by customer",
  reminder_sent: "Friendly reminder sent",
  escalation_sent: "Escalation notice sent",
  call_logged: "Call logged with accounts payable",
  note_added: "Internal note added",
  payment_received: "Payment received",
  dispute_raised: "Dispute raised by customer",
  automation_ran: "Automation ran",
};

export const collectionEvents: CollectionEvent[] = invoices.flatMap((inv) => {
  const out: CollectionEvent[] = [];
  const push = (
    type: CollectionEventType,
    at: Date,
    channel: CollectionEvent["channel"],
    actor: string,
    detail: string | null = null,
  ) =>
    out.push({
      id: id("evt"),
      workspace_id: workspace.id,
      invoice_id: inv.id,
      customer_id: inv.customer_id,
      type,
      channel,
      summary: EVENT_COPY[type],
      detail,
      actor,
      occurred_at: iso(at),
    });

  if (inv.status === "draft") return out;

  const issue = new Date(inv.issue_date);
  push("invoice_sent", issue, "email", "InvoicePilot");
  if (rnd() < 0.82) push("invoice_viewed", addDays(issue, intBetween(1, 4)), "system", inv.customer_name);

  const due = new Date(inv.due_date);
  if (inv.days_overdue > 1) {
    push(
      "automation_ran",
      addDays(due, 1),
      "system",
      "Friendly Payment Reminder",
      "Triggered 1 day after due date.",
    );
    push(
      "reminder_sent",
      addDays(due, 1),
      "email",
      "InvoicePilot",
      `Reminder sent to ${inv.customer_name} accounts payable.`,
    );
  }
  if (inv.days_overdue > 9) {
    push("reminder_sent", addDays(due, 8), "email", "Priya Raman", "Second reminder, firmer tone.");
  }
  if (inv.days_overdue > 22) {
    push("call_logged", addDays(due, 19), "phone", "Tom Okafor", "Left voicemail with AP; callback promised.");
  }
  if (inv.days_overdue > 35) {
    push("escalation_sent", addDays(due, 32), "email", "Alex Mercer", "Escalated to finance director.");
  }
  if (inv.status === "disputed") {
    push("dispute_raised", addDays(due, intBetween(2, 12)), "email", inv.customer_name, "Line item quantity queried.");
  }
  if (inv.paid_date) {
    push("payment_received", new Date(inv.paid_date), "system", "InvoicePilot");
  }
  return out;
});

collectionEvents.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));

/* ------------------------------------------------------------------ */
/* Automations                                                         */
/* ------------------------------------------------------------------ */

export const automations: Automation[] = [
  {
    id: id("aut"),
    workspace_id: workspace.id,
    name: "Friendly Payment Reminder",
    description:
      "Nudges the customer the day after an invoice falls overdue, then follows up once if it stays unpaid.",
    enabled: true,
    trigger_label: "Invoice becomes overdue",
    runs_30d: 148,
    recovered_cents_30d: 4_182_000,
    last_run_at: iso(addDays(NOW, 0)),
    created_at: iso(addDays(NOW, -286)),
    nodes: [
      { id: id("nd"), type: "trigger", title: "Invoice becomes overdue", detail: "Any invoice, any amount" },
      { id: id("nd"), type: "delay", title: "Wait 1 day", detail: "Business days only" },
      { id: id("nd"), type: "email", title: "Send friendly email", detail: "Template: Gentle nudge" },
      { id: id("nd"), type: "delay", title: "Wait 3 days", detail: "Business days only" },
      {
        id: id("nd"),
        type: "condition",
        title: "Check payment status",
        detail: "Has the balance been settled?",
        branches: [
          { label: "Paid", nodes: [{ id: id("nd"), type: "notification", title: "Close the loop", detail: "Notify owner, stop sequence" }] },
          {
            label: "Still unpaid",
            nodes: [
              { id: id("nd"), type: "email", title: "Send second reminder", detail: "Template: Firmer follow-up" },
              { id: id("nd"), type: "notification", title: "Notify finance manager", detail: "In-app + email digest" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: id("aut"),
    workspace_id: workspace.id,
    name: "Upcoming Payment Reminder",
    description: "Reminds the customer three days before the due date. The cheapest collection is the one you never have to make.",
    enabled: true,
    trigger_label: "3 days before due date",
    runs_30d: 96,
    recovered_cents_30d: 2_640_000,
    last_run_at: iso(addDays(NOW, -1)),
    created_at: iso(addDays(NOW, -240)),
    nodes: [
      { id: id("nd"), type: "trigger", title: "3 days before due date", detail: "Status is Sent or Viewed" },
      { id: id("nd"), type: "email", title: "Send courtesy reminder", detail: "Template: Upcoming payment" },
    ],
  },
  {
    id: id("aut"),
    workspace_id: workspace.id,
    name: "Escalation — 30 days overdue",
    description: "Escalates to a named contact and alerts the account owner once an invoice passes 30 days.",
    enabled: true,
    trigger_label: "Invoice 30 days overdue",
    runs_30d: 21,
    recovered_cents_30d: 1_845_000,
    last_run_at: iso(addDays(NOW, -2)),
    created_at: iso(addDays(NOW, -180)),
    nodes: [
      { id: id("nd"), type: "trigger", title: "Invoice 30 days overdue", detail: "Balance above $1,000" },
      { id: id("nd"), type: "email", title: "Send escalation notice", detail: "Template: Formal escalation" },
      { id: id("nd"), type: "sms", title: "Text the AP contact", detail: "Only if a mobile number exists" },
      { id: id("nd"), type: "notification", title: "Alert account owner", detail: "In-app, high priority" },
    ],
  },
  {
    id: id("aut"),
    workspace_id: workspace.id,
    name: "High-Value Invoice Alert",
    description: "Flags any invoice above $10,000 the moment it is issued so it never slips through unmonitored.",
    enabled: false,
    trigger_label: "Invoice > $10,000",
    runs_30d: 0,
    recovered_cents_30d: 0,
    last_run_at: null,
    created_at: iso(addDays(NOW, -64)),
    nodes: [
      { id: id("nd"), type: "trigger", title: "Invoice above $10,000 issued", detail: "Any customer" },
      { id: id("nd"), type: "notification", title: "Notify finance manager", detail: "In-app + email" },
      { id: id("nd"), type: "webhook", title: "Post to finance channel", detail: "Slack incoming webhook" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Integrations                                                        */
/* ------------------------------------------------------------------ */

const integrationSeed: Array<
  [string, string, Integration["category"], string, Integration["status"]]
> = [
  ["quickbooks", "QuickBooks", "accounting", "Sync customers, invoices and payments both ways.", "connected"],
  ["xero", "Xero", "accounting", "Import your Xero ledger and keep balances in step.", "available"],
  ["stripe", "Stripe", "payments", "Reconcile card and ACH payments automatically.", "connected"],
  ["paypal", "PayPal", "payments", "Match PayPal settlements against open invoices.", "available"],
  ["gmail", "Gmail", "communication", "Send reminders from your own address and thread replies.", "connected"],
  ["outlook", "Outlook", "communication", "Send and track reminders through Microsoft 365.", "available"],
  ["twilio", "Twilio", "communication", "Add SMS to escalation sequences.", "error"],
  ["shopify", "Shopify", "ecommerce", "Pull wholesale orders in as invoices.", "available"],
  ["woocommerce", "WooCommerce", "ecommerce", "Sync store orders and B2B accounts.", "available"],
  ["zapier", "Zapier", "automation", "Connect InvoicePilot to 6,000+ apps.", "available"],
  ["webhooks", "Webhooks", "automation", "Post collection events to your own endpoint.", "connected"],
];

export const integrations: Integration[] = integrationSeed.map(
  ([iid, name, category, description, status]) => ({
    id: iid,
    workspace_id: workspace.id,
    name,
    category,
    description,
    status,
    connected_at: status === "available" ? null : iso(addDays(NOW, -intBetween(30, 400))),
    last_synced_at:
      status === "connected" ? iso(addDays(NOW, -intBetween(0, 1))) : null,
  }),
);
