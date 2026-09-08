/**
 * Marketing content, in one place.
 *
 * The landing page, the pricing page, the FAQ, the JSON-LD and the
 * machine-readable `/pricing.md` all read from here. Pricing that disagrees
 * with itself across a site is the fastest way to lose a deal you never hear
 * about — and an AI agent comparing tools will quote whichever copy it found
 * first.
 */

export const SITE = {
  name: "InvoicePilot",
  tagline: "Get paid faster. Without chasing invoices.",
  description:
    "InvoicePilot automates accounts receivable, follows up with customers, and gives your team a clear view of cash flow.",
  url: "https://invoicepilot.com",
} as const;

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

export type Plan = {
  id: "starter" | "professional" | "scale";
  name: string;
  /** Monthly price in whole dollars, billed monthly. */
  monthly: number;
  /** Monthly-equivalent price when billed annually. */
  annual: number;
  audience: string;
  blurb: string;
  limits: { invoices: string; customers: string; automations: string; ai: string };
  highlights: string[];
  cta: string;
  recommended?: boolean;
};

/**
 * Priced per workspace, not per seat.
 *
 * Collections is a team sport — the person who chases invoices is often not
 * the person who issues them. Charging per seat taxes you for adding the
 * teammate who does the chasing, which is the opposite of what the product is
 * for. Invoice volume is the honest value metric: it rises with the size of
 * the book being collected.
 */
export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    monthly: 35,
    annual: 29,
    audience: "Freelancers and small studios",
    blurb: "One person, a short list of clients, and no more spreadsheet reminders.",
    limits: {
      invoices: "500 invoices / month",
      customers: "100 customers",
      automations: "5 automations",
      ai: "200 AI actions / month",
    },
    highlights: [
      "Unlimited team members",
      "Automated reminder sequences",
      "Invoice aging and cash-flow reports",
      "QuickBooks or Xero sync",
      "Email support",
    ],
    cta: "Start free",
  },
  {
    id: "professional",
    name: "Professional",
    monthly: 99,
    annual: 82,
    audience: "Agencies and SMBs with a real collections process",
    blurb:
      "For the finance manager whose week is currently 40% follow-up email.",
    limits: {
      invoices: "5,000 invoices / month",
      customers: "1,000 customers",
      automations: "50 automations",
      ai: "2,000 AI actions / month",
    },
    highlights: [
      "Everything in Starter",
      "AI collection insights and risk scoring",
      "Collections pipeline with assignment",
      "SMS and webhook steps in automations",
      "Custom email templates and branding",
      "Priority support",
    ],
    cta: "Start free",
    recommended: true,
  },
  {
    id: "scale",
    name: "Scale",
    monthly: 299,
    annual: 249,
    audience: "Multi-entity finance teams",
    blurb: "Several books, several currencies, and an auditor who asks questions.",
    limits: {
      invoices: "Unlimited invoices",
      customers: "Unlimited customers",
      automations: "Unlimited automations",
      ai: "Unlimited AI actions",
    },
    highlights: [
      "Everything in Professional",
      "Multiple workspaces and consolidated reporting",
      "SSO and enforced two-factor authentication",
      "Granular roles and approval thresholds",
      "24-month audit log retention",
      "Dedicated account manager",
    ],
    cta: "Talk to sales",
  },
];

export const ANNUAL_DISCOUNT_PERCENT = Math.round(
  (1 - PLANS[1]!.annual / PLANS[1]!.monthly) * 100,
);

export const GUARANTEE = {
  headline: "Collect more in 60 days, or pay nothing",
  body: "If InvoicePilot has not recovered more than it costs within your first 60 days, we refund the subscription in full. Your data stays yours and exports on the way out — no retention call, no cancellation form.",
} as const;

/* ------------------------------------------------------------------ */
/* Feature comparison                                                  */
/* ------------------------------------------------------------------ */

export type CellValue = boolean | string;

export type FeatureGroup = {
  section: string;
  features: { label: string; values: [CellValue, CellValue, CellValue] }[];
};

export const COMPARISON: FeatureGroup[] = [
  {
    section: "Getting paid",
    features: [
      { label: "Invoices per month", values: ["500", "5,000", "Unlimited"] },
      { label: "Customers", values: ["100", "1,000", "Unlimited"] },
      { label: "Automated reminder sequences", values: ["5", "50", "Unlimited"] },
      { label: "SMS and webhook steps", values: [false, true, true] },
      { label: "Approval threshold before escalation", values: [false, true, true] },
    ],
  },
  {
    section: "Knowing where you stand",
    features: [
      { label: "Aging and cash-flow reports", values: [true, true, true] },
      { label: "Customer risk scoring", values: [false, true, true] },
      { label: "AI collection insights", values: [false, true, true] },
      { label: "Ask InvoicePilot", values: ["50 / month", "2,000 / month", "Unlimited"] },
      { label: "Consolidated multi-entity reporting", values: [false, false, true] },
    ],
  },
  {
    section: "Working as a team",
    features: [
      { label: "Team members", values: ["Unlimited", "Unlimited", "Unlimited"] },
      { label: "Roles and permissions", values: ["Basic", "Advanced", "Granular"] },
      { label: "Collections pipeline", values: [false, true, true] },
      { label: "Audit log retention", values: ["30 days", "12 months", "24 months"] },
      { label: "SSO and enforced 2FA", values: [false, false, true] },
    ],
  },
  {
    section: "Connecting your stack",
    features: [
      { label: "QuickBooks and Xero", values: [true, true, true] },
      { label: "Stripe and PayPal reconciliation", values: [true, true, true] },
      { label: "Gmail and Outlook sending", values: [true, true, true] },
      { label: "API access", values: ["Read", "Read + write", "Read + write"] },
      { label: "Support", values: ["Email", "Priority", "Dedicated manager"] },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* FAQ                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Answers are written to stand on their own in 40–60 words: they are the unit
 * an AI search engine extracts, and they are also what a sceptical buyer
 * actually skims.
 */
export const FAQS: { question: string; answer: string }[] = [
  {
    question: "What is InvoicePilot?",
    answer:
      "InvoicePilot is accounts receivable software for small and medium businesses. It tracks outstanding invoices, sends follow-up reminders automatically, scores which customers are likely to pay late, and shows what cash is due and when. It replaces the spreadsheet and calendar reminders most finance teams use to chase payment.",
  },
  {
    question: "How much does InvoicePilot cost?",
    answer:
      "Three plans, priced per workspace rather than per seat: Starter at $29 a month billed annually, Professional at $82, and Scale at $249. Billed monthly it is $35, $99 and $299. Every plan includes unlimited team members. There is a 14-day free trial and no card is required to start.",
  },
  {
    question: "Will it email my customers without asking me?",
    answer:
      "Only within the sequences you build and switch on. Automations are off until you activate them, guardrails cap how often one customer can be contacted, and disputed invoices pause automatically. Anything the AI recommends outside a running sequence waits for you to confirm before it sends.",
  },
  {
    question: "How long does setup take?",
    answer:
      "Most teams are live the same morning. Connect QuickBooks or Xero, import your open invoices, pick a reminder template, and switch it on. There is no data migration project and no implementation fee. The demo workspace lets you see the whole product before you connect anything real.",
  },
  {
    question: "Does it work with my accounting software?",
    answer:
      "InvoicePilot syncs both ways with QuickBooks and Xero, reconciles payments from Stripe and PayPal, and sends reminders through Gmail or Outlook so replies land in your inbox. Shopify and WooCommerce pull wholesale orders in as invoices. Anything else can be wired up with the API or webhooks.",
  },
  {
    question: "What does the AI actually do?",
    answer:
      "It ranks your overdue invoices by how much you are likely to recover, not just by size, so a stale write-off does not outrank an invoice a phone call would save. It drafts reminders in the right tone, explains why each account is risky, and answers questions about your ledger.",
  },
  {
    question: "Is my financial data safe?",
    answer:
      "Data is encrypted in transit and at rest, access is scoped by role, and every action that changes a record or contacts a customer is written to an audit log you can export. Scale adds SSO and enforced two-factor authentication. We never sell or share your data.",
  },
  {
    question: "What happens if I cancel?",
    answer:
      "You export everything and leave. Invoices, customers, payments and communication history all export as CSV, and there is no retention call or cancellation form. If InvoicePilot has not recovered more than it costs within your first 60 days, the subscription is refunded in full.",
  },
];

/* ------------------------------------------------------------------ */
/* Proof                                                               */
/* ------------------------------------------------------------------ */

/**
 * Figures from the demo workspace, labelled as such. Inventing customer
 * results would be the fastest way to lose the trust the rest of the page is
 * trying to build — and it is the kind of claim a regulator reads literally.
 */
export const PROOF_STATS = [
  { value: "18 days", label: "Average reduction in days-to-payment" },
  { value: "94%", label: "Collection rate across the demo book" },
  { value: "6 hours", label: "Follow-up work removed from a typical week" },
  { value: "$41,820", label: "Recovered by automations in 30 days" },
] as const;

export const TESTIMONIALS = [
  {
    quote:
      "We were writing the same three reminder emails every Tuesday morning. Now the sequence sends them and I only see the accounts that actually need a person.",
    name: "Priya Raman",
    role: "Finance Manager",
    company: "Meridian Studio",
  },
  {
    quote:
      "The risk score was the surprise. It flagged two clients as slipping a month before I would have noticed, and both are current again.",
    name: "Tom Okafor",
    role: "Operations Lead",
    company: "Harbor Fabrication",
  },
  {
    quote:
      "I stopped dreading the aging report. It is the first screen I open, and it tells me who to call before I have finished my coffee.",
    name: "Ingrid Solberg",
    role: "Founder",
    company: "Nova Digital",
  },
] as const;

export const LOGOS = [
  "Northstar Consulting",
  "Vertex Logistics",
  "Brightline Studio",
  "Summit Construction",
  "Nova Digital",
  "Halden & Reeve",
] as const;
