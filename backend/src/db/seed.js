/**
 * The demo ledger.
 *
 * Ported from app/seeds/demo.py and app/seeds/rng.py, which were ported from
 * src/lib/data/seed.ts. So this is the original JavaScript coming home: the
 * Math.imul masking and the js_round helper existed only because Python's
 * integers grow and its round() breaks ties to even. Both are native here.
 *
 * Deterministic: the same seed produces the same 460 invoices, the same
 * customers and the same amounts on every run, so a screenshot taken today
 * matches one taken next month and a failing invariant points at a regression
 * rather than at fresh randomness.
 *
 * The anchor date is *not* fixed. invoice_state derives days_overdue from
 * CURRENT_DATE, so a ledger pinned to a literal date ages a day every day and
 * eventually holds nothing in the "current" aging bucket. The seed value is
 * what makes a reseed reproducible; the anchor is what keeps it honest.
 *
 * Porting notes carried from demo.py:
 * - seed.ts writes status "overdue" for a stale open invoice. That status no
 *   longer exists in the schema; "sent" is written instead, and invoice_state
 *   derives overdue-ness from the due date.
 * - seed.ts writes a per-invoice "risk" field. Dropped; risk comes from the
 *   customer_stats view.
 * - Line items split the invoice total evenly rather than by a random share.
 *   Both sum to the total; the even split removes a source of drift and
 *   nothing downstream reads an individual item amount.
 */

export const SEED = 0x0001_9f0c;
export const INVOICE_COUNT = 460;

const LEDGER_START_DAYS = 430;
const SIZE_SCALE = 0.12;
const DELINQUENCY_HORIZON_DAYS = 210;
const MS_DAY = 86_400_000;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The helper set from seed.ts, bound to one generator. */
export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    pick: (items) => items[Math.floor(next() * items.length)],
    between: (lo, hi) => lo + next() * (hi - lo),
    intBetween: (lo, hi) => Math.floor(lo + next() * (hi + 1 - lo)),
  };
}

/** The ledger's reference point: the day it is seeded, at 09:12 UTC. */
export function anchorDate(today = new Date()) {
  return new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 9, 12),
  );
}

export const addDays = (date, days) => new Date(date.getTime() + days * MS_DAY);
export const isoDate = (date) => date.toISOString().slice(0, 10);
export const dayDiff = (a, b) => Math.round((a.getTime() - b.getTime()) / MS_DAY);

// Copied from app/seeds/demo.py:62-102, itself copied from
// src/lib/data/seed.ts:167-206. Data, not logic.
export const CUSTOMER_SEEDS = Object.freeze([
  { name: "Acme Corporation", industry: "Manufacturing", contact: "Dana Whitfield", domain: "acmecorp.com", reliability: 0.34, size: 9200, terms: 30, trend: -0.28 },
  { name: "Northstar Consulting", industry: "Professional Services", contact: "Miles Rutherford", domain: "northstar-consulting.com", reliability: 0.41, size: 6400, terms: 30, trend: -0.19 },
  { name: "Brightline Studio", industry: "Creative Agency", contact: "Yuki Tanaka", domain: "brightlinestudio.com", reliability: 0.62, size: 4800, terms: 14, trend: -0.06 },
  { name: "Vertex Logistics", industry: "Logistics", contact: "Carla Mendes", domain: "vertexlogistics.com", reliability: 0.78, size: 15400, terms: 45, trend: 0.04 },
  { name: "Summit Construction", industry: "Construction", contact: "Raymond Ellis", domain: "summitconstruction.com", reliability: 0.52, size: 22800, terms: 45, trend: -0.11 },
  { name: "Nova Digital", industry: "Software", contact: "Ingrid Solberg", domain: "novadigital.io", reliability: 0.88, size: 5200, terms: 14, trend: 0.07 },
  { name: "Halden & Reeve", industry: "Legal", contact: "Beatrice Halden", domain: "haldenreeve.com", reliability: 0.91, size: 11200, terms: 30, trend: 0.02 },
  { name: "Portside Freight", industry: "Logistics", contact: "Omar Haddad", domain: "portsidefreight.com", reliability: 0.47, size: 18600, terms: 60, trend: -0.14 },
  { name: "Cedarwood Interiors", industry: "Design & Build", contact: "Marta Kovac", domain: "cedarwoodinteriors.com", reliability: 0.71, size: 7400, terms: 30, trend: 0.01 },
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
  { name: "Copperfield Labs", industry: "Biotech", contact: "Ana Beltran", domain: "copperfieldlabs.com", reliability: 0.81, size: 24800, terms: 45, trend: 0.02 },
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
  { name: "Orchard Lane Foods", industry: "Food & Beverage", contact: "Tomas Ferreira", domain: "orchardlanefoods.com", reliability: 0.61, size: 8300, terms: 30, trend: -0.08 },
  { name: "Delmar Aviation", industry: "Aviation", contact: "Celine Rousseau", domain: "delmaraviation.com", reliability: 0.75, size: 36800, terms: 60, trend: 0.0 },
  { name: "Ashcroft Financial", industry: "Finance", contact: "Nigel Ashcroft", domain: "ashcroftfinancial.com", reliability: 0.92, size: 15900, terms: 14, trend: 0.04 },
  { name: "Verdant Landscapes", industry: "Landscaping", contact: "Isabel Moreno", domain: "verdantlandscapes.com", reliability: 0.56, size: 5400, terms: 30, trend: -0.1 },
  { name: "Stonebridge Academy", industry: "Education", contact: "Harriet Blythe", domain: "stonebridgeacademy.edu", reliability: 0.84, size: 12900, terms: 45, trend: 0.01 },
  { name: "Tessera Software", industry: "Software", contact: "Rui Nakamura", domain: "tessera.dev", reliability: 0.89, size: 7200, terms: 14, trend: 0.06 },
  { name: "Ravenswood Brewing", industry: "Food & Beverage", contact: "Gabriel Stokes", domain: "ravenswoodbrewing.com", reliability: 0.59, size: 4600, terms: 30, trend: -0.06 },
  { name: "Meridian Freight Lines", industry: "Logistics", contact: "Aisha Bello", domain: "meridianfreightlines.com", reliability: 0.68, size: 19800, terms: 45, trend: -0.03 },
]);

export const LINE_ITEMS = Object.freeze({
  default: ["Professional services retainer", "Project delivery milestone", "Consulting hours", "Account management"],
  Manufacturing: ["Tooling and setup", "Production run", "Quality inspection", "Materials handling"],
  Logistics: ["Freight forwarding", "Warehousing (monthly)", "Last-mile delivery", "Customs brokerage"],
  Construction: ["Site preparation", "Structural works progress claim", "Fit-out labour", "Materials supply"],
  Software: ["Platform licence (annual)", "Implementation services", "Priority support tier", "Custom integration"],
  Healthcare: ["Clinical services", "Equipment servicing", "Compliance audit", "Staff training programme"],
  "Creative Agency": ["Brand identity phase", "Campaign production", "Content retainer", "Motion design"],
});

export const METHODS = Object.freeze(["bank_transfer", "ach", "card", "stripe", "check", "paypal"]);

export const EVENT_SUMMARY = Object.freeze({
  invoice_sent: "Invoice sent",
  invoice_viewed: "Invoice viewed by customer",
  reminder_sent: "Friendly reminder sent",
  escalation_sent: "Escalation notice sent",
  call_logged: "Call logged with accounts payable",
  payment_received: "Payment received",
  dispute_raised: "Dispute raised by customer",
  automation_ran: "Automation ran",
});

/**
 * A log-ish spread around the customer's typical size, rounded to a believable
 * invoice figure rather than a random cent value.
 */
function amountFor(seed, rng) {
  const factor = Math.exp(rng.between(-0.55, 0.6));
  const dollars = seed.size * SIZE_SCALE * factor;
  return Math.max(48_000, Math.round(dollars / 10) * 10 * 100);
}

/** Days after the due date this customer actually pays. */
function settlementDelay(seed, ageDays, rng) {
  // Behaviour drifts: `trend` moves recent invoices later or earlier.
  const recency = 1 - Math.min(ageDays / LEDGER_START_DAYS, 1);
  const drift = -seed.trend * 18 * recency;
  // Reliable accounts genuinely pay early. That offset is what makes on-time
  // rate a real statistic rather than noise around the due date.
  const base = (1 - seed.reliability) * 40 - 14;
  return Math.round(base + drift + rng.between(-4, 6));
}

/**
 * Some invoices are never settled inside the horizon. Without this the ledger
 * self-cleans: every old invoice ends up paid, the aging report has nothing
 * past 30 days, and that is not what a collections book looks like.
 */
function isDelinquent(seed, ageDays, rng) {
  if (ageDays > DELINQUENCY_HORIZON_DAYS) return false;
  return rng.next() < (1 - seed.reliability) * 0.34;
}

/**
 * Split a total across line items so they sum to it exactly. The remainder
 * goes on the last item; rounding each independently loses cents and the
 * line-items invariant fails.
 */
export function splitIntoItems(amountCents, count) {
  const each = Math.floor(amountCents / count);
  const items = new Array(count).fill(each);
  items[count - 1] = amountCents - each * (count - 1);
  return items;
}

export function buildDrafts(rng, now) {
  const drafts = [];

  for (let i = 0; i < INVOICE_COUNT; i += 1) {
    // Weighted so a handful of accounts dominate the ledger, as in a real book.
    const customerIndex = Math.floor(rng.next() ** 1.55 * CUSTOMER_SEEDS.length);
    const seed = CUSTOMER_SEEDS[customerIndex];

    const ageDays = Math.round(rng.next() * LEDGER_START_DAYS);
    const issue = addDays(now, -ageDays);
    const due = addDays(issue, seed.terms);
    const amountCents = amountFor(seed, rng);

    const delay = settlementDelay(seed, ageDays, rng);
    const settled = isDelinquent(seed, ageDays, rng)
      ? addDays(now, 3650)
      : addDays(due, delay);

    let status;
    let paid = null;
    let paidCents = 0;

    if (settled <= now) {
      status = "paid";
      paid = settled;
      paidCents = amountCents;
    } else if (due < now) {
      const roll = rng.next();
      if (roll < 0.08) {
        status = "disputed";
      } else if (roll < 0.2) {
        status = "partially_paid";
        paidCents = Math.round((amountCents * rng.between(0.25, 0.6)) / 1000) * 1000;
      } else {
        status = "sent";
      }
    } else {
      const roll = rng.next();
      status = roll < 0.12 ? "draft" : roll < 0.55 ? "sent" : "viewed";
    }

    drafts.push({ seed, customerIndex, issue, due, paid, amountCents, paidCents, status });
  }

  // Sorted by issue date so invoice numbers run in chronological order. Array
  // sort is stable, so equal issue dates keep their generated order and the
  // ledger stays reproducible.
  drafts.sort((a, b) => a.issue - b.issue);
  return drafts;
}
