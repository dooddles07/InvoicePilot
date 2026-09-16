# Express Backend Port P3 — Seeder, Reseed and Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the demo seeder to JavaScript, ship the guarded reseed endpoint and its daily Vercel cron, delete the Python service, and deploy Express on Render behind the existing Next frontend on Vercel.

**Architecture:** `src/db/seed.js` holds the whole demo ledger: a mulberry32 generator, the customer table, the draft builder (pure, no database) and `seedDemoWorkspace(sql, options)`, which writes the rows through the handle it is given. The handle is a transaction in a test, the pool in the CLI, and a `sql.begin()` transaction in the reseed controller — the same rule P2 set. `POST /api/admin/reseed` is guarded by a constant-time `X-Admin-Token` comparison and takes its workspace id from configuration, never from the request. A Vercel cron hits a Next Route Handler, which verifies `CRON_SECRET` and forwards to Render.

**Tech Stack:** Node 22, JavaScript (ESM), Express 5, `postgres` (postgres.js), `@node-rs/argon2`, `node:test`, `node:assert/strict`, `node:util` `parseArgs`, PostgreSQL 16+, Next 16 Route Handler (TypeScript), Render free web service, Vercel hobby, Neon free Postgres.

**Spec:** `docs/superpowers/specs/2026-09-15-express-backend-port-design.md`
(demo access, reseed guards and the cron come from
`docs/superpowers/specs/2026-09-11-free-tier-deployment-and-phases-3-6-design.md` §4,
which the Express spec §10 keeps unchanged.)

## Global Constraints

- JavaScript only under `backend/`. No TypeScript, no `.ts` files, no build step. `"type": "module"` — ESM everywhere, no `require`.
- Node 22. `node --test` is the test runner; Vitest is not a dependency of this package.
- Money is integer minor units: `amount_cents`, `paid_cents`, `balance_cents` are `bigint`. Never `float`, never `numeric`, never a formatted string.
- Every tenant table carries `workspace_id` with an index that leads on it.
- The database client is configured `max: 5`, `prepare: false`. Neon's pooled endpoint runs PgBouncer in transaction mode, which rejects prepared statements.
- Tests require `DATABASE_URL` to point at a database whose name contains `test`. The suite drops and recreates the `public` schema on every run.
- No module reads the environment or opens a connection at import time. Configuration and the client are built on first use.
- A service or seeder function takes a database handle and never opens its own transaction. The caller decides: `transaction(sql, fn)` in a controller or a CLI, `withRollback` in a test.
- Every DB-touching test file imports `sql` from `tests/helpers/database.js` and ends with `after(() => sql.end())`. Without it `node --test` hangs on the open pool instead of exiting. (P2 deviation, now a standing rule.)
- The workspace comes from the signed token — or, for the admin endpoint, from `DEMO_WORKSPACE_ID` in configuration. No handler reads a workspace id from a body, a query string or a path segment to decide what it may touch.
- No CORS middleware, and no cookie reading in the backend. The browser never calls this service; the Next server does.
- Commit messages: Conventional Commits, no AI attribution trailer.
- `AGENTS.md` rule: read the relevant guide under `node_modules/next/dist/docs/` before writing any Next file. Task 5 is the only task that writes one; the guide is named in its steps.

## Scope

**In P3:** `src/db/seed.js` (generator, writer and CLI), the ledger-invariant suite, `deleteWorkspaceData`, `POST /api/admin/reseed` with its token guard, the Vercel cron Route Handler, the `vercel.json` reduction, deletion of every Python file, the backend README rewrite, and deploying both services.

**Not in P3:** the thirteen stub domains stay stubs. No model functions, no shared scoping helper beyond what the seeder needs, no frontend data wiring — the dashboard still renders `src/lib/data/` fixtures, and only the session comes from the API. The one-click "View the demo" button is phase 3–6 work: P3 logs in with the demo credentials through the ordinary login form.

## Corrections to the spec

Two things in the spec do not survive contact with the code. Both are
deliberate and recorded here, because spec §14 says anything this port appears
to change that is not the host, the language or the framework is a defect.

**1. The ledger is anchored to the day it is seeded, not to a literal date.**
`app/seeds/demo.py:41` pins `NOW = 2026-09-08T09:12Z`, and spec §7 asks for a
fixed seed so reseeds are identical. The seed *value* stays fixed — the
reference date cannot. `invoice_state` derives `days_overdue` from
`CURRENT_DATE`, so a ledger pinned to a literal date ages a day every day:
with terms of at most 60 days, the newest invoice in the fixed ledger falls out
of the "current" aging bucket around 2026-11-07, and the eighth ledger
invariant — a spread across every aging bucket — starts failing on its own.
A demo that reseeds nightly into an all-overdue book demonstrates a bug. So
`seedDemoWorkspace` takes `now`, defaulting to today at 09:12 UTC. The RNG seed
is unchanged, so every invoice keeps its number, its customer and its amount
across reseeds; only the dates shift with the anchor. Screenshots stay
reproducible in shape and money, which is what §7 wanted them for.

**2. The reseed deletes rows table by table, not by cascading from the
workspace.** `invoices.customer_id` is `ON DELETE RESTRICT` and both tables
cascade from `workspaces`. PostgreSQL does not define the order in which
sibling cascade triggers fire, and `RESTRICT` raises immediately rather than
deferring to the end of the statement, so `DELETE FROM workspaces` can fail
depending on which cascade runs first. `deleteWorkspaceData` walks an explicit
child-first list instead. Same outcome, no ordering gamble.

## Transactions: who opens them

Unchanged from P2, and it decides the seeder's shape. `seedDemoWorkspace` takes
a handle and never calls `sql.begin` — the handle postgres.js passes into a
transaction callback has no `.begin`, so a seeder that opened its own would
throw the moment a test handed it the `withRollback` transaction. Use
`transaction(sql, fn)` from `src/db/index.js` at the call site: it calls
`sql.begin` on a pool and `sql.savepoint` on a transaction.

## File Structure

```
backend/
├── package.json                    modified: "seed" script
├── .env.example                    modified: ADMIN_TOKEN, DEMO_WORKSPACE_ID
├── README.md                       rewritten: the Express service, not FastAPI
├── src/
│   ├── app.js                      modified: mounts /api/admin
│   ├── config.js                   modified: adminToken, demoWorkspaceId (both optional)
│   ├── db/
│   │   └── seed.js                 new: RNG, customer table, drafts, writer, CLI
│   ├── middleware/
│   │   └── admin-token.js          new: constant-time X-Admin-Token guard
│   ├── models/
│   │   └── workspaces.js           modified: findFirstMember, deleteWorkspaceData
│   ├── routes/
│   │   └── admin.js                new
│   └── controllers/
│       └── admin.js                new
├── tests/
│   ├── helpers/app.js              modified: withApp takes a config, send takes headers
│   ├── seed-generator.test.js      new: RNG parity and draft invariants, no database
│   ├── seed.test.js                new: the ledger invariants, ported from test_ledger_invariants.py
│   ├── admin-reseed.test.js        new
│   └── config.test.js              modified: the two new optional values
└── (deleted) app/ migrations/ scripts/ tests/*.py alembic.ini pytest.ini requirements.txt

(repository root)
├── vercel.json                     reduced to the cron entry
├── .env.example                    modified: ADMIN_TOKEN, CRON_SECRET, DEMO_WORKSPACE_ID
└── src/app/api/cron/reseed/route.ts   new: verifies CRON_SECRET, forwards to Render
```

---

### Task 1: The deterministic generator

Everything in `seed.js` that needs no database: the RNG, the customer table and
the draft builder. Ported from `backend/app/seeds/rng.py` and
`backend/app/seeds/demo.py`, which were themselves ported from
`src/lib/data/seed.ts`. This is the original JavaScript coming home —
`Math.imul` masking and `js_round` existed only because Python has neither, and
both go.

**Files:**
- Create: `backend/src/db/seed.js`
- Test: `backend/tests/seed-generator.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SEED` (number), `INVOICE_COUNT` (460), `CUSTOMER_SEEDS` (frozen array of 40 `{name, industry, contact, domain, reliability, size, terms, trend}`), `LINE_ITEMS`, `METHODS`, `EVENT_SUMMARY`, `mulberry32(seed) -> () => number`, `makeRng(seed) -> {next, pick, between, intBetween}`, `anchorDate(today?) -> Date`, `addDays(date, days) -> Date`, `isoDate(date) -> "YYYY-MM-DD"`, `dayDiff(a, b) -> number`, `splitIntoItems(amountCents, count) -> number[]`, `buildDrafts(rng, now) -> Draft[]` where a `Draft` is `{seed, customerIndex, issue, due, paid, amountCents, paidCents, status}`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/seed-generator.test.js`:

```js
/**
 * The generator half of the seeder: no database, no clock beyond the anchor it
 * is handed.
 *
 * The RNG parity numbers are the ones the Python port asserted
 * (tests/test_rng.py), produced by running the mulberry32 in
 * src/lib/data/seed.ts under node. If they change, the demo ledger is a
 * different ledger and every screenshot in the repository is stale.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CUSTOMER_SEEDS,
  INVOICE_COUNT,
  SEED,
  anchorDate,
  buildDrafts,
  dayDiff,
  isoDate,
  makeRng,
  mulberry32,
  splitIntoItems,
} from "../src/db/seed.js";

const EXPECTED_FIRST_FIVE = [
  0.1912623210810125,
  0.23377290950156748,
  0.9647377305664122,
  0.8688520358409733,
  0.06411144742742181,
];

describe("mulberry32", () => {
  it("matches the generator src/lib/data/seed.ts uses", () => {
    const rnd = mulberry32(SEED);
    for (const want of EXPECTED_FIRST_FIVE) {
      assert.ok(Math.abs(rnd() - want) < 1e-12);
    }
  });

  it("is a pure function of its seed", () => {
    const a = mulberry32(SEED);
    const b = mulberry32(SEED);
    assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  });
});

describe("the rng helpers", () => {
  it("picks inside the array and stays inside the bounds", () => {
    const rng = makeRng(SEED);
    for (let i = 0; i < 500; i += 1) {
      assert.ok(["a", "b", "c"].includes(rng.pick(["a", "b", "c"])));
      const n = rng.intBetween(3, 7);
      assert.ok(Number.isInteger(n) && n >= 3 && n <= 7, `got ${n}`);
      const f = rng.between(-1, 1);
      assert.ok(f >= -1 && f < 1);
    }
  });
});

describe("anchorDate", () => {
  it("is the given day at 09:12 UTC", () => {
    const anchor = anchorDate(new Date("2026-09-16T23:45:00.000Z"));
    assert.equal(anchor.toISOString(), "2026-09-16T09:12:00.000Z");
  });
});

describe("splitIntoItems", () => {
  it("splits a total so the parts sum to it exactly", () => {
    // The remainder goes on the last item. Rounding each part independently
    // leaves cents unaccounted for and the line-items invariant fails.
    for (const [total, count] of [[100_003, 3], [48_000, 1], [7, 4]]) {
      const parts = splitIntoItems(total, count);
      assert.equal(parts.length, count);
      assert.equal(parts.reduce((sum, part) => sum + part, 0), total);
    }
  });
});

describe("the customer table", () => {
  it("is the forty accounts the demo book is built from", () => {
    assert.equal(CUSTOMER_SEEDS.length, 40);
    assert.equal(new Set(CUSTOMER_SEEDS.map((s) => s.domain)).size, 40);
    for (const seed of CUSTOMER_SEEDS) {
      assert.ok(seed.reliability > 0 && seed.reliability <= 1);
      assert.ok([14, 30, 45, 60].includes(seed.terms));
    }
  });
});

describe("buildDrafts", () => {
  const now = anchorDate(new Date("2026-09-16T00:00:00.000Z"));
  const drafts = buildDrafts(makeRng(SEED), now);

  it("builds the whole ledger", () => {
    assert.equal(drafts.length, INVOICE_COUNT);
  });

  it("is reproducible from the seed", () => {
    const again = buildDrafts(makeRng(SEED), now);
    assert.deepEqual(JSON.stringify(again), JSON.stringify(drafts));
  });

  it("runs in chronological order, so invoice numbers do too", () => {
    for (let i = 1; i < drafts.length; i += 1) {
      assert.ok(drafts[i - 1].issue <= drafts[i].issue);
    }
  });

  it("never bills less than the floor, and never in fractional cents", () => {
    for (const draft of drafts) {
      assert.ok(Number.isSafeInteger(draft.amountCents));
      assert.ok(draft.amountCents >= 48_000);
    }
  });

  it("never records more paid than billed", () => {
    for (const draft of drafts) {
      assert.ok(draft.paidCents >= 0 && draft.paidCents <= draft.amountCents);
    }
  });

  it("settles a paid invoice in full, with a date, in the past", () => {
    for (const draft of drafts.filter((d) => d.status === "paid")) {
      assert.equal(draft.paidCents, draft.amountCents);
      assert.ok(draft.paid instanceof Date);
      assert.ok(draft.paid <= now);
    }
  });

  it("leaves a paid date on nothing else", () => {
    for (const draft of drafts.filter((d) => d.status !== "paid")) {
      assert.equal(draft.paid, null);
    }
  });

  it("issues nothing in the future and dues nothing before issue", () => {
    for (const draft of drafts) {
      assert.ok(draft.issue <= now);
      assert.ok(draft.due >= draft.issue);
    }
  });

  it("produces a book with every status in it", () => {
    // A ledger of one status demonstrates one screen.
    assert.deepEqual(
      [...new Set(drafts.map((d) => d.status))].sort(),
      ["disputed", "draft", "paid", "partially_paid", "sent", "viewed"],
    );
  });

  it("leaves real delinquency behind, not a self-cleaning book", () => {
    const stillOpen = drafts.filter(
      (d) => d.status !== "paid" && d.status !== "draft" && dayDiff(now, d.due) > 90,
    );
    assert.ok(stillOpen.length > 10, `only ${stillOpen.length} over 90 days`);
  });
});

describe("isoDate", () => {
  it("is the calendar day, for a date column", () => {
    assert.equal(isoDate(new Date("2026-09-16T09:12:00.000Z")), "2026-09-16");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `backend/`): `node --test tests/seed-generator.test.js`
Expected: FAIL — `Cannot find module` for `../src/db/seed.js`.

- [ ] **Step 3: Write the generator**

Create `backend/src/db/seed.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/seed-generator.test.js`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/seed.js backend/tests/seed-generator.test.js
git commit -m "feat: port the deterministic demo ledger generator"
```

---

### Task 2: Writing the ledger

`seedDemoWorkspace` turns the drafts into rows, and the eight ledger
invariants from `tests/test_ledger_invariants.py` prove the result reconciles.
The invariants are the most valuable logic in the original mockup: the
aggregation is what every screen displays, and when it drifts every screen lies
in a plausible-looking way.

**Files:**
- Modify: `backend/src/db/seed.js`
- Test: `backend/tests/seed.test.js`

**Interfaces:**
- Consumes: Task 1's generator; `insertEmailTemplates(sql, workspaceId)` from `src/models/notifications.js`.
- Produces: `slugFor(workspaceId) -> string`, `seedDemoWorkspace(sql, {workspaceId, ownerUserId, role?, now?}) -> Promise<{customers, invoices, items, payments, events}>`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/seed.test.js`:

```js
/**
 * The seeded ledger, and the seven-and-one invariants ported from
 * tests/test_ledger_invariants.py (itself ported from src/lib/data/verify.ts).
 *
 * One workspace is seeded per test inside a rolled-back transaction. Seeding
 * 460 invoices takes a second or two; the invariants are grouped into one test
 * body each so the cost is paid twice, not sixteen times.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { anchorDate, seedDemoWorkspace } from "../src/db/seed.js";
import { insertUser } from "../src/models/auth.js";
import { sql, withRollback } from "./helpers/database.js";

after(() => sql.end());

const NOW = anchorDate(new Date());

async function seeded(tx, options = {}) {
  const user = await insertUser(tx, {
    id: randomUUID(),
    email: `demo-${randomUUID()}@example.test`,
    fullName: "Alex Mercer",
    passwordHash: "",
  });
  const workspaceId = randomUUID();
  const counts = await seedDemoWorkspace(tx, {
    workspaceId,
    ownerUserId: user.id,
    now: NOW,
    ...options,
  });
  return { workspaceId, userId: user.id, counts };
}

describe("seedDemoWorkspace", () => {
  it("writes the workspace, its admin member and its templates", async () => {
    await withRollback(async (tx) => {
      const { workspaceId, userId } = await seeded(tx);

      const [workspace] = await tx`
        SELECT name, slug, plan FROM workspaces WHERE id = ${workspaceId}
      `;
      assert.equal(workspace.name, "Meridian Studio");
      assert.equal(workspace.plan, "professional");
      assert.ok(workspace.slug.startsWith("meridian-studio-"));

      const [member] = await tx`
        SELECT user_id, role, status FROM workspace_members
        WHERE workspace_id = ${workspaceId}
      `;
      // admin, not owner: the demo must exercise the write path without
      // reaching billing:write, which belongs to a parked screen.
      assert.equal(member.role, "admin");
      assert.equal(member.status, "active");
      assert.equal(member.user_id, userId);

      const [templates] = await tx`
        SELECT COUNT(*)::int AS count FROM email_templates
        WHERE workspace_id = ${workspaceId}
      `;
      assert.equal(templates.count, 3);
    });
  });

  it("writes the whole book and reports what it wrote", async () => {
    await withRollback(async (tx) => {
      const { workspaceId, counts } = await seeded(tx);

      assert.equal(counts.customers, 40);
      assert.equal(counts.invoices, 460);

      for (const [table, expected] of [
        ["customers", counts.customers],
        ["invoices", counts.invoices],
        ["invoice_items", counts.items],
        ["payments", counts.payments],
        ["collection_events", counts.events],
      ]) {
        const [row] = await tx`
          SELECT COUNT(*)::int AS count FROM ${tx(table)}
          WHERE workspace_id = ${workspaceId}
        `;
        assert.equal(row.count, expected, `${table} count`);
      }
      assert.ok(counts.payments > 0 && counts.events > counts.invoices);
    });
  });

  it("is reproducible: two seedings agree invoice for invoice", async () => {
    await withRollback(async (tx) => {
      const first = await seeded(tx);
      const second = await seeded(tx);

      const shape = (workspaceId) => tx`
        SELECT number, amount_cents, paid_cents, status, issue_date, due_date
        FROM invoices WHERE workspace_id = ${workspaceId} ORDER BY number
      `;
      assert.deepEqual(
        JSON.stringify(await shape(first.workspaceId)),
        JSON.stringify(await shape(second.workspaceId)),
      );
    });
  });

  it("writes money as numbers, not strings", async () => {
    await withRollback(async (tx) => {
      const { workspaceId } = await seeded(tx);
      const [row] = await tx`
        SELECT amount_cents, balance_cents FROM invoices
        WHERE workspace_id = ${workspaceId} LIMIT 1
      `;
      assert.equal(typeof row.amount_cents, "number");
      assert.equal(typeof row.balance_cents, "number");
    });
  });
});

describe("the ledger invariants", () => {
  it("reconciles", async () => {
    await withRollback(async (tx) => {
      const { workspaceId: ws } = await seeded(tx);

      const [row] = await tx`
        SELECT
          (SELECT COUNT(*)::int FROM invoices
           WHERE workspace_id = ${ws} AND amount_cents <= 0) AS non_positive,
          (SELECT COUNT(*)::int FROM invoices
           WHERE workspace_id = ${ws}
             AND (balance_cents < 0 OR balance_cents > amount_cents)) AS bad_balance,
          (SELECT COUNT(*)::int FROM invoices
           WHERE workspace_id = ${ws}
             AND status = 'paid' AND balance_cents <> 0) AS paid_with_balance,
          (SELECT COUNT(*)::int FROM invoices
           WHERE workspace_id = ${ws}
             AND paid_date IS NOT NULL AND status <> 'paid') AS dated_but_unpaid,
          (SELECT COUNT(*)::int FROM (
             SELECT i.id FROM invoices i
             JOIN invoice_items it ON it.invoice_id = i.id
             WHERE i.workspace_id = ${ws}
             GROUP BY i.id, i.amount_cents
             HAVING SUM(it.amount_cents) <> i.amount_cents
           ) q) AS item_mismatch,
          (SELECT COUNT(*)::int FROM (
             SELECT i.id FROM invoices i
             LEFT JOIN payments p ON p.invoice_id = i.id
             WHERE i.workspace_id = ${ws}
             GROUP BY i.id, i.paid_cents
             HAVING COALESCE(SUM(p.amount_cents), 0) <> i.paid_cents
           ) q) AS payment_mismatch
      `;

      assert.deepEqual(row, {
        non_positive: 0,
        bad_balance: 0,
        paid_with_balance: 0,
        dated_but_unpaid: 0,
        item_mismatch: 0,
        payment_mismatch: 0,
      });
    });
  });

  it("buckets the open ledger exactly once, across every bucket", async () => {
    await withRollback(async (tx) => {
      const { workspaceId: ws } = await seeded(tx);

      const bucketed = tx`
        SELECT balance_cents, CASE
          WHEN days_overdue <= 0 THEN 'current'
          WHEN days_overdue <= 30 THEN '1_30'
          WHEN days_overdue <= 60 THEN '31_60'
          WHEN days_overdue <= 90 THEN '61_90'
          ELSE '90_plus' END AS bucket
        FROM invoice_state
        WHERE workspace_id = ${ws} AND status NOT IN ('draft', 'paid')
      `;

      const rows = await bucketed;
      const [totals] = await tx`
        SELECT
          COALESCE(SUM(balance_cents), 0)::bigint AS open_total,
          COUNT(*)::int AS open_count
        FROM invoice_state
        WHERE workspace_id = ${ws} AND status NOT IN ('draft', 'paid')
      `;

      // Every open invoice lands in exactly one bucket, and the buckets add up
      // to the open ledger. An aging report that does not is a report that
      // hides money.
      assert.equal(rows.length, totals.open_count);
      assert.equal(
        rows.reduce((sum, r) => sum + Number(r.balance_cents), 0),
        Number(totals.open_total),
      );

      // A collections product whose demo data is all 'current' demonstrates
      // nothing. This is what the delinquency horizon is for.
      assert.deepEqual(
        [...new Set(rows.map((r) => r.bucket))].sort(),
        ["1_30", "31_60", "61_90", "90_plus", "current"],
      );
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/seed.test.js` (or `node --test tests/seed.test.js` when the schema is already migrated)
Expected: FAIL — `seedDemoWorkspace is not a function` / `not exported`.

- [ ] **Step 3: Write the writer**

Append to `backend/src/db/seed.js` (imports go at the top of the file):

```js
import { randomUUID } from "node:crypto";

import { insertEmailTemplates } from "../models/notifications.js";
```

```js
/**
 * Deterministic, so a reseed keeps the same slug and nothing bookmarked
 * breaks. Unique, because workspaces.slug is unique.
 */
export const slugFor = (workspaceId) => `meridian-studio-${workspaceId.slice(0, 8)}`;

/**
 * postgres.js builds one multi-row INSERT per call. Chunked because a single
 * statement is capped at 65535 bound parameters, and collection_events is a
 * few thousand rows wide of ten columns each.
 */
async function insertRows(sql, table, rows, chunkSize = 500) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    await sql`INSERT INTO ${sql(table)} ${sql(rows.slice(index, index + chunkSize))}`;
  }
  return rows.length;
}

/**
 * Write the demo ledger into `workspaceId`, owned by `ownerUserId`.
 *
 * Takes a handle and opens no transaction: the caller owns atomicity, which is
 * what lets a test roll the whole ledger back. The user row is the caller's to
 * create -- it is not workspace-scoped, and a reseed deliberately leaves it
 * alone so the demo password survives.
 */
export async function seedDemoWorkspace(
  sql,
  { workspaceId, ownerUserId, role = "admin", now = anchorDate() },
) {
  const rng = makeRng(SEED);

  await sql`
    INSERT INTO workspaces (id, name, slug, plan, currency)
    VALUES (${workspaceId}, 'Meridian Studio', ${slugFor(workspaceId)}, 'professional', 'USD')
  `;

  // admin, not owner: the demo visitor must be able to write, and owner would
  // also grant billing:write, which belongs to a parked preview screen.
  await sql`
    INSERT INTO workspace_members (id, workspace_id, user_id, role, status)
    VALUES (${randomUUID()}, ${workspaceId}, ${ownerUserId}, ${role}, 'active')
  `;

  await insertEmailTemplates(sql, workspaceId);

  const customerIds = CUSTOMER_SEEDS.map(() => randomUUID());
  const customers = CUSTOMER_SEEDS.map((seed, index) => ({
    id: customerIds[index],
    workspace_id: workspaceId,
    name: seed.name,
    contact_name: seed.contact,
    email: `${seed.contact.split(" ")[0].toLowerCase()}@${seed.domain}`,
    phone: `+1 (${rng.intBetween(201, 989)}) ${rng.intBetween(200, 999)}-${String(rng.intBetween(1000, 9999)).padStart(4, "0")}`,
    industry: seed.industry,
    payment_terms_days: seed.terms,
    customer_since: isoDate(addDays(now, -rng.intBetween(LEDGER_START_DAYS, LEDGER_START_DAYS + 900))),
  }));
  await insertRows(sql, "customers", customers);

  const drafts = buildDrafts(rng, now);

  const invoiceIds = drafts.map(() => randomUUID());
  const invoices = [];
  const items = [];
  let sequence = 380;

  drafts.forEach((draft, index) => {
    sequence += 1;
    const invoiceId = invoiceIds[index];

    const itemCount = rng.intBetween(1, 4);
    const pool = LINE_ITEMS[draft.seed.industry] ?? LINE_ITEMS.default;
    splitIntoItems(draft.amountCents, itemCount).forEach((share, position) => {
      const quantity = rng.intBetween(1, 12);
      items.push({
        id: randomUUID(),
        workspace_id: workspaceId,
        invoice_id: invoiceId,
        description: pool[position % pool.length],
        quantity,
        // amount_cents (share) is the number that must sum to the invoice
        // total -- that is the tested invariant. Integer division can leave
        // unit_price_cents * quantity a cent or two off share; unit_price_cents
        // is cosmetic and nothing recomputes a line total from it.
        unit_price_cents: Math.floor(share / quantity),
        amount_cents: share,
      });
    });

    const daysOverdue = draft.status === "paid" ? 0 : dayDiff(now, draft.due);
    const lastContactedAt =
      daysOverdue > 3
        ? addDays(now, -rng.intBetween(1, Math.min(daysOverdue, 21)))
        : null;
    const poNumber = rng.next() < 0.45 ? `PO-${rng.intBetween(10000, 99999)}` : null;

    invoices.push({
      id: invoiceId,
      workspace_id: workspaceId,
      number: `INV-${draft.issue.getUTCFullYear()}-${String(sequence).padStart(5, "0")}`,
      customer_id: customerIds[draft.customerIndex],
      status: draft.status,
      amount_cents: draft.amountCents,
      paid_cents: draft.paidCents,
      issue_date: isoDate(draft.issue),
      due_date: isoDate(draft.due),
      paid_date: draft.paid ? isoDate(draft.paid) : null,
      po_number: poNumber,
      sent_at: draft.status === "draft" ? null : draft.issue,
      viewed_at: ["viewed", "partially_paid", "paid", "disputed"].includes(draft.status)
        ? addDays(draft.issue, 1)
        : null,
      last_contacted_at: lastContactedAt,
    });
  });

  await insertRows(sql, "invoices", invoices);
  await insertRows(sql, "invoice_items", items);

  const payments = [];
  drafts.forEach((draft, index) => {
    if (draft.paidCents <= 0) return;
    const receivedAt = draft.paid ?? addDays(now, -rng.intBetween(1, 20));
    payments.push({
      id: randomUUID(),
      workspace_id: workspaceId,
      invoice_id: invoiceIds[index],
      customer_id: customerIds[draft.customerIndex],
      amount_cents: draft.paidCents,
      method: rng.pick(METHODS),
      reference: `${rng.pick(["TXN", "REF", "BAT"])}-${rng.intBetween(100000, 999999)}`,
      received_at: receivedAt,
    });
  });
  await insertRows(sql, "payments", payments);

  const events = [];
  drafts.forEach((draft, index) => {
    if (draft.status === "draft") return;

    const invoiceId = invoiceIds[index];
    const customerId = customerIds[draft.customerIndex];
    const customerName = draft.seed.name;
    const push = (type, occurredAt, channel, actor, detail = null) => {
      events.push({
        id: randomUUID(),
        workspace_id: workspaceId,
        invoice_id: invoiceId,
        customer_id: customerId,
        type,
        channel,
        summary: EVENT_SUMMARY[type],
        detail,
        actor,
        occurred_at: occurredAt,
      });
    };

    push("invoice_sent", draft.issue, "email", "InvoicePilot");
    if (rng.next() < 0.82) {
      push("invoice_viewed", addDays(draft.issue, rng.intBetween(1, 4)), "system", customerName);
    }

    const daysOverdue = draft.status === "paid" ? 0 : dayDiff(now, draft.due);
    if (daysOverdue > 1) {
      push("automation_ran", addDays(draft.due, 1), "system", "Friendly Payment Reminder", "Triggered 1 day after due date.");
      push("reminder_sent", addDays(draft.due, 1), "email", "InvoicePilot", `Reminder sent to ${customerName} accounts payable.`);
    }
    if (daysOverdue > 9) {
      push("reminder_sent", addDays(draft.due, 8), "email", "Priya Raman", "Second reminder, firmer tone.");
    }
    if (daysOverdue > 22) {
      push("call_logged", addDays(draft.due, 19), "phone", "Tom Okafor", "Left voicemail with AP; callback promised.");
    }
    if (daysOverdue > 35) {
      push("escalation_sent", addDays(draft.due, 32), "email", "Alex Mercer", "Escalated to finance director.");
    }
    if (draft.status === "disputed") {
      push("dispute_raised", addDays(draft.due, rng.intBetween(2, 12)), "email", customerName, "Line item quantity queried.");
    }
    if (draft.paid) {
      push("payment_received", draft.paid, "system", "InvoicePilot");
    }
  });
  await insertRows(sql, "collection_events", events);

  return {
    customers: customers.length,
    invoices: invoices.length,
    items: items.length,
    payments: payments.length,
    events: events.length,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/seed.test.js`
Expected: PASS — six `seedDemoWorkspace` tests and both invariant tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — every P1 and P2 suite plus the two new files.

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/seed.js backend/tests/seed.test.js
git commit -m "feat: write the demo ledger and assert its invariants"
```

---

### Task 3: The seed command

One entry point for a first seeding: create the demo user with a real password
hash, then seed the workspace. `scripts/seed_demo.py` did this for Python;
`npm run seed` does it here. `parseArgs` is in `node:util`, so no argument
parser is added.

**Files:**
- Modify: `backend/src/db/seed.js` (the CLI tail), `backend/src/config.js`, `backend/package.json`, `backend/.env.example`
- Test: `backend/tests/config.test.js`

**Interfaces:**
- Consumes: `seedDemoWorkspace` from Task 2; `hashPassword` from `src/lib/security.js`; `insertUser`, `findUserByEmail` from `src/models/auth.js`; `findWorkspaceById` from `src/models/workspaces.js`; `loadConfig`, `getSql`, `transaction`.
- Produces: `config.adminToken` (string or null), `config.demoWorkspaceId` (string or null), and the `npm run seed` command.

- [ ] **Step 1: Write the failing config test**

Append to `backend/tests/config.test.js`, inside the existing `describe("loadConfig")`:

```js
  it("reads the admin token and the demo workspace id", () => {
    const config = loadConfig({
      ...valid,
      ADMIN_TOKEN: "t".repeat(32),
      DEMO_WORKSPACE_ID: "3f1d2c80-0000-4000-8000-000000000001",
    });
    assert.equal(config.adminToken, "t".repeat(32));
    assert.equal(config.demoWorkspaceId, "3f1d2c80-0000-4000-8000-000000000001");
  });

  it("leaves both null when unset, and does not throw", () => {
    // The reseed endpoint is the only caller. A deployment without a demo
    // workspace should still boot; the endpoint refuses instead.
    const config = loadConfig(valid);
    assert.equal(config.adminToken, null);
    assert.equal(config.demoWorkspaceId, null);
  });

  it("refuses an admin token too short to be worth having", () => {
    assert.throws(
      () => loadConfig({ ...valid, ADMIN_TOKEN: "t".repeat(31) }),
      /ADMIN_TOKEN must be at least 32 characters/,
    );
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/config.test.js`
Expected: FAIL — `config.adminToken` is `undefined`, not `null`.

- [ ] **Step 3: Extend the configuration**

In `backend/src/config.js`, add the constant and the two reads:

```js
const ADMIN_TOKEN_MIN_LENGTH = 32;
```

and inside `loadConfig`, before the `return`:

```js
  // Optional: only the reseed endpoint reads these, and a deployment without a
  // demo workspace should still boot. Short is refused rather than accepted,
  // because this token is the only thing standing in front of a delete.
  const adminToken = env.ADMIN_TOKEN ?? null;
  if (adminToken !== null && adminToken.length < ADMIN_TOKEN_MIN_LENGTH) {
    throw new Error(
      `ADMIN_TOKEN must be at least ${ADMIN_TOKEN_MIN_LENGTH} characters`,
    );
  }
```

and extend the returned object:

```js
    adminToken,
    demoWorkspaceId: env.DEMO_WORKSPACE_ID ?? null,
```

- [ ] **Step 4: Run the config test to verify it passes**

Run: `node --test tests/config.test.js`
Expected: PASS.

- [ ] **Step 5: Write the CLI**

At the top of `backend/src/db/seed.js`, add to the imports:

```js
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { hashPassword } from "../lib/security.js";
import { findUserByEmail, insertUser } from "../models/auth.js";
import { findWorkspaceById } from "../models/workspaces.js";
import { loadConfig } from "../config.js";
import { getSql, transaction } from "./index.js";
```

and append at the end of the file:

```js
/**
 *   npm run seed -- --email demo@example.com --password "…"
 *
 * Commits, unlike the test fixture. Refuses to seed over a workspace that
 * already exists: replacing one is what POST /api/admin/reseed is for, and a
 * command that silently doubled the ledger would be discovered as a chart.
 */
async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      password: { type: "string" },
      name: { type: "string", default: "Alex Mercer" },
      role: { type: "string", default: "admin" },
    },
  });

  if (!values.email || !values.password) {
    throw new Error("--email and --password are required");
  }

  const config = loadConfig();
  const workspaceId = config.demoWorkspaceId ?? randomUUID();
  const sql = getSql(config.databaseUrl);

  try {
    const counts = await transaction(sql, async (tx) => {
      if (await findWorkspaceById(tx, workspaceId)) {
        throw new Error(
          `workspace ${workspaceId} already exists; POST /api/admin/reseed replaces it`,
        );
      }
      const existing = await findUserByEmail(tx, values.email);
      const user =
        existing ??
        (await insertUser(tx, {
          id: randomUUID(),
          email: values.email,
          fullName: values.name,
          passwordHash: await hashPassword(values.password),
        }));
      return seedDemoWorkspace(tx, {
        workspaceId,
        ownerUserId: user.id,
        role: values.role,
      });
    });

    console.log(`seeded ${workspaceId}: ${JSON.stringify(counts)}`);
    if (!config.demoWorkspaceId) {
      console.log(`set DEMO_WORKSPACE_ID=${workspaceId} on both services`);
    }
  } finally {
    await sql.end();
  }
}

// Only when run as a command. Importing this module must open no connection.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
```

- [ ] **Step 6: Add the script and document the variables**

In `backend/package.json`, add to `scripts`:

```json
    "seed": "node src/db/seed.js",
```

In `backend/.env.example`, append:

```
# Guards POST /api/admin/reseed. At least 32 characters; no default. Same value
# as the frontend's ADMIN_TOKEN, which the cron handler forwards.
ADMIN_TOKEN="replace-me-with-at-least-thirty-two-characters"

# The only workspace the reseed endpoint may touch. Printed by `npm run seed`
# on a first seeding; set it on both services afterwards.
DEMO_WORKSPACE_ID=""
```

- [ ] **Step 7: Run the command against a local database**

Run (from `backend/`, with `DATABASE_URL` pointing at a scratch database and
`SECRET_KEY` set):

```bash
npm run seed -- --email demo@example.com --password "demo-password-not-for-production"
```

Expected: `seeded <uuid>: {"customers":40,"invoices":460,…}` followed by the
`set DEMO_WORKSPACE_ID=…` line. Running it a second time with that
`DEMO_WORKSPACE_ID` exported fails with `workspace … already exists`.

- [ ] **Step 8: Run the whole suite**

Run: `npm test`
Expected: PASS — importing `seed.js` still opens no connection, so every suite
is unaffected.

- [ ] **Step 9: Commit**

```bash
git add backend/src/db/seed.js backend/src/config.js backend/package.json backend/.env.example backend/tests/config.test.js
git commit -m "feat: seed a demo workspace from the command line"
```

---

### Task 4: The reseed endpoint

`POST /api/admin/reseed` deletes the demo workspace's rows and rebuilds them in
one transaction. Two guards, each sufficient on its own: the `X-Admin-Token`
must match `ADMIN_TOKEN` in constant time, and the workspace id comes from
configuration, so no request can name a different one. The third guard the
free-tier spec relied on — an unroutable backend — is gone with Render's public
hostname, which is why this task does not simplify the other two.

**Files:**
- Create: `backend/src/middleware/admin-token.js`, `backend/src/routes/admin.js`, `backend/src/controllers/admin.js`
- Modify: `backend/src/models/workspaces.js`, `backend/src/app.js`, `backend/tests/helpers/app.js`
- Test: `backend/tests/admin-reseed.test.js`

**Interfaces:**
- Consumes: `seedDemoWorkspace` (Task 2), `config.adminToken` and `config.demoWorkspaceId` (Task 3), `transaction` from `src/db/index.js`, `NotFound`/`AuthenticationFailed` from `src/middleware/errors.js`.
- Produces: `requireAdminToken(config)` middleware, `adminRouter(sql, config)`, `adminController(sql, config).reseed`, `findFirstMember(sql, workspaceId) -> {user_id, role} | undefined`, `deleteWorkspaceData(sql, workspaceId) -> Promise<void>`. Response body: `{workspace_id, customers, invoices, items, payments, events}`.

- [ ] **Step 1: Write the failing test**

First extend the harness so a test can pass its own config and headers. In
`backend/tests/helpers/app.js`, change the two signatures:

```js
export async function withApp(fn, config = TEST_CONFIG) {
  return withRollback(async (tx) => {
    const server = createApp(config, tx).listen(0);
```

and inside `send`:

```js
    async function send(method, path, { body, token, headers } = {}) {
      const response = await fetch(`${origin}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
```

Then create `backend/tests/admin-reseed.test.js`:

```js
/**
 * The one endpoint in this service that deletes data.
 *
 * Its guards are the whole test: a wrong token, an absent token and an
 * unconfigured service all answer 401 before a single row is read, and the
 * workspace it rebuilds is the one in configuration whatever the request says.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { seedDemoWorkspace } from "../src/db/seed.js";
import { insertUser } from "../src/models/auth.js";
import { deleteWorkspaceData } from "../src/models/workspaces.js";
import { TEST_CONFIG, withApp } from "./helpers/app.js";
import { sql, withRollback } from "./helpers/database.js";

after(() => sql.end());

const ADMIN_TOKEN = "a".repeat(32);
const DEMO_WORKSPACE_ID = "3f1d2c80-0000-4000-8000-000000000001";

const configWith = (overrides) => ({
  ...TEST_CONFIG,
  adminToken: ADMIN_TOKEN,
  demoWorkspaceId: DEMO_WORKSPACE_ID,
  ...overrides,
});

async function makeDemoUser(tx) {
  const user = await insertUser(tx, {
    id: randomUUID(),
    email: `demo-${randomUUID()}@example.test`,
    fullName: "Alex Mercer",
    passwordHash: "argon2-placeholder",
  });
  return user.id;
}

describe("POST /api/admin/reseed", () => {
  it("refuses a request with no token", async () => {
    await withApp(async ({ send }) => {
      const response = await send("POST", "/api/admin/reseed");
      assert.equal(response.status, 401);
      assert.equal(response.body.detail, "Invalid credentials");
    }, configWith({}));
  });

  it("refuses a wrong token", async () => {
    await withApp(async ({ send }) => {
      const response = await send("POST", "/api/admin/reseed", {
        headers: { "X-Admin-Token": "b".repeat(32) },
      });
      assert.equal(response.status, 401);
    }, configWith({}));
  });

  it("refuses a token of a different length", async () => {
    // timingSafeEqual throws on unequal lengths; the guard must answer 401,
    // not 500.
    await withApp(async ({ send }) => {
      const response = await send("POST", "/api/admin/reseed", {
        headers: { "X-Admin-Token": "a".repeat(8) },
      });
      assert.equal(response.status, 401);
    }, configWith({}));
  });

  it("refuses everything when the service has no admin token", async () => {
    await withApp(async ({ send }) => {
      const response = await send("POST", "/api/admin/reseed", {
        headers: { "X-Admin-Token": ADMIN_TOKEN },
      });
      assert.equal(response.status, 401);
    }, configWith({ adminToken: null }));
  });

  it("answers 404 when the demo workspace has not been seeded", async () => {
    await withApp(async ({ send }) => {
      const response = await send("POST", "/api/admin/reseed", {
        headers: { "X-Admin-Token": ADMIN_TOKEN },
      });
      assert.equal(response.status, 404);
    }, configWith({}));
  });

  it("rebuilds the demo workspace and keeps its id, slug and member", async () => {
    await withApp(async ({ send, tx }) => {
      const userId = await makeDemoUser(tx);
      await seedDemoWorkspace(tx, {
        workspaceId: DEMO_WORKSPACE_ID,
        ownerUserId: userId,
      });
      const [before] = await tx`
        SELECT slug FROM workspaces WHERE id = ${DEMO_WORKSPACE_ID}
      `;
      const [firstInvoice] = await tx`
        SELECT id FROM invoices WHERE workspace_id = ${DEMO_WORKSPACE_ID} LIMIT 1
      `;

      const response = await send("POST", "/api/admin/reseed", {
        headers: { "X-Admin-Token": ADMIN_TOKEN },
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.workspace_id, DEMO_WORKSPACE_ID);
      assert.equal(response.body.invoices, 460);

      const [after_] = await tx`
        SELECT slug FROM workspaces WHERE id = ${DEMO_WORKSPACE_ID}
      `;
      assert.equal(after_.slug, before.slug);

      // The rows are new ones, not the old ones left in place.
      const [survivor] = await tx`
        SELECT id FROM invoices WHERE id = ${firstInvoice.id}
      `;
      assert.equal(survivor, undefined);

      const [member] = await tx`
        SELECT user_id, role FROM workspace_members
        WHERE workspace_id = ${DEMO_WORKSPACE_ID}
      `;
      assert.equal(member.user_id, userId);
      assert.equal(member.role, "admin");

      // The user row survives, so the demo password survives with it.
      const [user] = await tx`SELECT id FROM users WHERE id = ${userId}`;
      assert.ok(user);
    }, configWith({}));
  });

  it("touches no other workspace, whatever the body asks for", async () => {
    await withApp(async ({ send, tx }) => {
      const demoUser = await makeDemoUser(tx);
      await seedDemoWorkspace(tx, {
        workspaceId: DEMO_WORKSPACE_ID,
        ownerUserId: demoUser,
      });

      const otherUser = await makeDemoUser(tx);
      const otherId = randomUUID();
      await seedDemoWorkspace(tx, { workspaceId: otherId, ownerUserId: otherUser });

      const response = await send("POST", "/api/admin/reseed", {
        headers: { "X-Admin-Token": ADMIN_TOKEN },
        body: { workspace_id: otherId },
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.workspace_id, DEMO_WORKSPACE_ID);

      const [row] = await tx`
        SELECT COUNT(*)::int AS count FROM invoices WHERE workspace_id = ${otherId}
      `;
      assert.equal(row.count, 460);
    }, configWith({}));
  });

  it("is repeatable: the ledger does not double", async () => {
    await withApp(async ({ send, tx }) => {
      const userId = await makeDemoUser(tx);
      await seedDemoWorkspace(tx, {
        workspaceId: DEMO_WORKSPACE_ID,
        ownerUserId: userId,
      });

      await send("POST", "/api/admin/reseed", {
        headers: { "X-Admin-Token": ADMIN_TOKEN },
      });
      await send("POST", "/api/admin/reseed", {
        headers: { "X-Admin-Token": ADMIN_TOKEN },
      });

      const [row] = await tx`
        SELECT COUNT(*)::int AS count FROM invoices
        WHERE workspace_id = ${DEMO_WORKSPACE_ID}
      `;
      assert.equal(row.count, 460);
    }, configWith({}));
  });
});

describe("deleteWorkspaceData", () => {
  it("leaves a neighbouring workspace's rows alone", async () => {
    await withRollback(async (tx) => {
      const keeperUser = await makeDemoUser(tx);
      const keeper = randomUUID();
      await seedDemoWorkspace(tx, { workspaceId: keeper, ownerUserId: keeperUser });

      const doomedUser = await makeDemoUser(tx);
      const doomed = randomUUID();
      await seedDemoWorkspace(tx, { workspaceId: doomed, ownerUserId: doomedUser });

      await deleteWorkspaceData(tx, doomed);

      const [gone] = await tx`SELECT id FROM workspaces WHERE id = ${doomed}`;
      assert.equal(gone, undefined);
      const [left] = await tx`
        SELECT COUNT(*)::int AS count FROM invoices WHERE workspace_id = ${doomed}
      `;
      assert.equal(left.count, 0);
      const [kept] = await tx`
        SELECT COUNT(*)::int AS count FROM invoices WHERE workspace_id = ${keeper}
      `;
      assert.equal(kept.count, 460);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/admin-reseed.test.js`
Expected: FAIL — `/api/admin/reseed` answers 404 from Express's own handler
(no router mounted), so the first assertion of 401 fails.

- [ ] **Step 3: Write the token guard**

Create `backend/src/middleware/admin-token.js`:

```js
/**
 * The guard on the one endpoint that deletes data.
 *
 * Constant-time, because a token compared with === leaks its prefix to anyone
 * willing to measure. Fails closed when the service has no token configured:
 * an unset ADMIN_TOKEN must not mean "no check".
 *
 * Deliberately not `authenticate`: this is a machine-to-machine secret, not a
 * session, and it carries no principal and no workspace.
 */
import { timingSafeEqual } from "node:crypto";

import { AuthenticationFailed } from "./errors.js";

export function requireAdminToken(config) {
  return function requireAdminTokenOnRequest(request, response, next) {
    if (!config.adminToken || !config.demoWorkspaceId) {
      throw new AuthenticationFailed();
    }

    const provided = Buffer.from(request.get("x-admin-token") ?? "", "utf8");
    const expected = Buffer.from(config.adminToken, "utf8");
    // timingSafeEqual throws on unequal lengths, so length is checked first.
    // That leaks the token's length and nothing else.
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      throw new AuthenticationFailed();
    }

    next();
  };
}
```

- [ ] **Step 4: Write the model functions**

Append to `backend/src/models/workspaces.js`:

```js
/**
 * The oldest member with a real user behind it. The reseed needs to know who
 * owns the rebuilt workspace, and the answer is whoever owned the old one.
 */
export async function findFirstMember(sql, workspaceId) {
  const [row] = await sql`
    SELECT user_id, role FROM workspace_members
    WHERE workspace_id = ${workspaceId} AND user_id IS NOT NULL
    ORDER BY created_at
    LIMIT 1
  `;
  return row;
}

/**
 * Child rows first, then the workspace.
 *
 * Not a bare DELETE FROM workspaces relying on ON DELETE CASCADE:
 * invoices.customer_id is ON DELETE RESTRICT, both tables cascade from
 * workspaces, and PostgreSQL does not define which sibling cascade fires
 * first. RESTRICT raises immediately rather than deferring to the end of the
 * statement, so the cascade can fail on its own schema. The list is boring and
 * it cannot.
 *
 * `users` is not here: it is not workspace-scoped, and leaving the demo user
 * in place is what lets a reseed keep its password.
 */
const TENANT_TABLES = [
  "collection_events",
  "communication_logs",
  "audit_logs",
  "invoice_items",
  "payments",
  "invoices",
  "customers",
  "email_templates",
  "import_batches",
  "workspace_members",
];

export async function deleteWorkspaceData(sql, workspaceId) {
  for (const table of TENANT_TABLES) {
    await sql`DELETE FROM ${sql(table)} WHERE workspace_id = ${workspaceId}`;
  }
  await sql`DELETE FROM workspaces WHERE id = ${workspaceId}`;
}
```

- [ ] **Step 5: Write the controller and the router**

Create `backend/src/controllers/admin.js`:

```js
/**
 * Rebuild the demo workspace.
 *
 * The workspace id comes from configuration and nowhere else. A request body
 * naming another workspace is ignored, not rejected: there is no code path
 * here by which a real tenant's rows can be deleted.
 */
import { transaction } from "../db/index.js";
import { seedDemoWorkspace } from "../db/seed.js";
import { NotFound } from "../middleware/errors.js";
import { deleteWorkspaceData, findFirstMember } from "../models/workspaces.js";

export function adminController(sql, config) {
  return {
    async reseed(request, response) {
      const workspaceId = config.demoWorkspaceId;

      const counts = await transaction(sql, async (tx) => {
        const member = await findFirstMember(tx, workspaceId);
        if (!member) {
          // Nothing to rebuild, and nobody to own the rebuild. `npm run seed`
          // creates the workspace once; this endpoint only replaces it.
          throw new NotFound(`No seeded workspace ${workspaceId}`);
        }

        await deleteWorkspaceData(tx, workspaceId);
        return seedDemoWorkspace(tx, {
          workspaceId,
          ownerUserId: member.user_id,
          role: member.role,
        });
      });

      response.json({ workspace_id: workspaceId, ...counts });
    },
  };
}
```

Create `backend/src/routes/admin.js`:

```js
import { Router } from "express";

import { adminController } from "../controllers/admin.js";
import { requireAdminToken } from "../middleware/admin-token.js";

/**
 * Not mounted behind `authenticate`: this is called by the Vercel cron
 * handler, which holds a shared secret rather than a session.
 */
export function adminRouter(sql, config) {
  const controller = adminController(sql, config);
  const router = Router();

  router.post("/reseed", requireAdminToken(config), controller.reseed);

  return router;
}
```

- [ ] **Step 6: Mount it**

In `backend/src/app.js`, add the import:

```js
import { adminRouter } from "./routes/admin.js";
```

and add the entry to the mount table, after `["/api/audit", auditRouter]`:

```js
    ["/api/admin", adminRouter],
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- tests/admin-reseed.test.js`
Expected: PASS — all eight tests.

- [ ] **Step 8: Run the whole suite**

Run: `npm test`
Expected: PASS. The stub-route inventory is unchanged: `/api/admin/reseed` is
guarded by a token rather than by `requirePermission`, so the guard scan in
`stub-routes.test.js` still sees exactly the permissions the table lists.

- [ ] **Step 9: Commit**

```bash
git add backend/src/middleware/admin-token.js backend/src/routes/admin.js backend/src/controllers/admin.js backend/src/models/workspaces.js backend/src/app.js backend/tests/helpers/app.js backend/tests/admin-reseed.test.js
git commit -m "feat: rebuild the demo workspace behind an admin token"
```

---

### Task 5: The daily cron

Vercel's one hobby cron hits a Next Route Handler, which checks Vercel's
`CRON_SECRET` and forwards to Render with the admin token. `vercel.json` loses
the services block and both rewrites — there is no second Vercel service to
route to any more.

**Read first:** `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
and `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
(`AGENTS.md` requires the guide before a Next file is written). What they
settle: a `route.ts` exports one function per HTTP method, Route Handlers are
not cached by default, and reading a request header makes the handler
request-time regardless.

**Files:**
- Create: `src/app/api/cron/reseed/route.ts`
- Modify: `vercel.json`, `.env.example`

**Interfaces:**
- Consumes: `POST /api/admin/reseed` from Task 4, over `API_BASE_URL`.
- Produces: `GET /api/cron/reseed` on the Vercel deployment.

- [ ] **Step 1: Write the handler**

Create `src/app/api/cron/reseed/route.ts`:

```ts
/**
 * The daily demo reset.
 *
 * Vercel's cron calls this with `Authorization: Bearer ${CRON_SECRET}`; this
 * handler forwards to the Express service with the admin token. The token
 * never reaches a browser: this runs on the server, and the route answers
 * nothing useful without the cron secret.
 *
 * Render suspends a free service after 15 minutes idle and Neon after five, so
 * a cold call pays both wake-ups before the reseed starts. 60 seconds is the
 * most a Vercel hobby function may run; if that is not enough the cron fails
 * and the demo keeps yesterday's ledger until the next run, which is a stale
 * demo rather than a broken one. The fallback, if it becomes chronic, is a
 * scheduled GitHub Actions workflow calling this same path.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const adminToken = process.env.ADMIN_TOKEN;
  const baseUrl = process.env.API_BASE_URL;

  if (!cronSecret || !adminToken || !baseUrl) {
    return Response.json({ detail: "Reseed is not configured" }, { status: 500 });
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ detail: "Invalid credentials" }, { status: 401 });
  }

  const response = await fetch(`${baseUrl}/api/admin/reseed`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": adminToken },
    cache: "no-store",
  });

  // Pass the backend's own status through, so a failed reseed is visible in
  // Vercel's cron log rather than reported as a success. Read as text first: a
  // sleeping Render service answers 502 in HTML, and response.json() would
  // throw on it and turn a clear 502 into an opaque 500.
  const body = await response.text();
  return new Response(body || JSON.stringify({ detail: response.statusText }), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
```

- [ ] **Step 2: Reduce `vercel.json`**

Replace the whole file with:

```json
{
  "crons": [{ "path": "/api/cron/reseed", "schedule": "0 4 * * *" }]
}
```

The services block and both rewrites described a two-service Vercel
deployment. The backend is a Render web service now, reached over
`API_BASE_URL`; there is nothing left for Vercel to route.

- [ ] **Step 3: Document the frontend variables**

Replace `.env.example` at the repository root with:

```
# The Express backend. Locally that is `npm start` inside backend/; on Vercel it
# is the Render service URL. The browser never sees this: only the Next server
# calls it, with a bearer token.
API_BASE_URL="http://127.0.0.1:3001"

# The demo workspace's id, printed by `npm run seed` in backend/. Decides
# whether the demo banner renders.
DEMO_WORKSPACE_ID=""

# Same value as the backend's ADMIN_TOKEN. The cron handler forwards it; it is
# never sent to a browser.
ADMIN_TOKEN=""

# Vercel sets this on the cron request as `Authorization: Bearer ${CRON_SECRET}`.
CRON_SECRET=""
```

- [ ] **Step 4: Verify the frontend still compiles**

Run (from the repository root): `npx tsc --noEmit && npm run build`
Expected: both exit 0, and the build output lists `/api/cron/reseed` as a
route.

- [ ] **Step 5: Verify the handler by hand**

Run the backend (`npm start` in `backend/`, with `ADMIN_TOKEN`,
`DEMO_WORKSPACE_ID` and a seeded database), then `npm run dev` at the root with
`CRON_SECRET=local-secret` and the same `ADMIN_TOKEN`, then:

```bash
curl -i http://127.0.0.1:3000/api/cron/reseed
curl -i -H "Authorization: Bearer local-secret" http://127.0.0.1:3000/api/cron/reseed
```

Expected: 401 for the first, and 200 with `{"workspace_id":…,"invoices":460,…}`
for the second.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/reseed/route.ts vercel.json .env.example
git commit -m "feat: reset the demo workspace from a daily cron"
```

---

### Task 6: Delete the Python service

The ported auth passes its tests against a real database and the seeder is
ported, which is the condition spec §13 sets for this. Everything Python goes,
and the documents that describe a FastAPI service stop describing one.

**Files:**
- Delete: `backend/app/`, `backend/migrations/`, `backend/scripts/`, every `backend/tests/*.py`, `backend/tests/__init__.py`, `backend/alembic.ini`, `backend/pytest.ini`, `backend/requirements.txt`
- Modify: `backend/README.md`, `backend/.gitignore`, `src/lib/api/client.ts`, `src/lib/api/session.ts`, `src/proxy.ts`, `src/types/index.ts`

- [ ] **Step 1: Delete every Python file**

```bash
git rm -r backend/app backend/migrations backend/scripts
git rm backend/tests/*.py backend/alembic.ini backend/pytest.ini backend/requirements.txt
```

- [ ] **Step 2: Verify nothing Python is left**

Run: `git ls-files backend | grep -E '\.(py|ini|cfg)$|requirements'`
Expected: no output.

- [ ] **Step 3: Trim the backend `.gitignore`**

Replace `backend/.gitignore` with:

```
node_modules/
.env
```

- [ ] **Step 4: Rewrite the backend README**

Replace `backend/README.md` with:

```markdown
# InvoicePilot API

Express 5 service behind the InvoicePilot frontend. JavaScript, ESM, no build
step. Six endpoints do real work — signup, login, refresh, logout,
switch-workspace and `GET /api/users/me` — and forty-nine answer `501` so the
endpoint surface matches what the frontend already expects.

## Architecture

```
Frontend (Next.js on Vercel)
      │  JSON over HTTPS, bearer token
      ▼
routes/          paths, guards            src/routes/*.js
      ▼
controllers/     validate, delegate, shape (Zod)
      ▼
services/        business rules, where rules exist (auth only, so far)
      ▼
models/          hand-written SQL, workspace-scoped
      ▼
PostgreSQL       src/sql/*.sql, applied at boot by src/db/migrate.js
```

The view is the React already deployed on Vercel. There is no ORM: the
derivation views (`invoice_state`, `customer_stats`, `collection_queue`) define
every derived value, and the models are thin SQL over them.

## Layout

```
src/
├── server.js       reads config, migrates, listens
├── app.js          express app, routers, error handler last
├── config.js       environment read once, fail fast
├── db/             client, migration runner, demo seeder
├── sql/            0000_schema.sql, 0001_derivation_views.sql
├── middleware/     authenticate, requirePermission, requireAdminToken, errors
├── routes/         15 files, one per domain plus admin
├── controllers/    15 files
├── models/         14 files
├── services/       auth.js
└── lib/            security.js — argon2, JWT, refresh tokens, ROLE_PERMISSIONS
```

## Three decisions worth knowing

**1. The workspace comes from the token.** `Principal.workspaceId` is read from
the signed access token, never from a body, a query string or a path segment,
so a caller cannot widen their own scope by editing a URL. Cross-tenant reads
answer `404`, not `403`: a `403` confirms the record exists.

**2. Money is integer minor units.** `amount_cents`, `paid_cents` and
`balance_cents` are `bigint`. postgres.js returns `int8` as a string, so
`src/db/index.js` parses it to a number once, asserting it fits
`Number.MAX_SAFE_INTEGER`. Deciding that per query is how one screen formats
`"120000"` as a string.

**3. A service never opens its own transaction.** It takes a handle. The
controller wraps a multi-statement use case in `transaction(sql, fn)`; a test
hands the same function a transaction it rolls back. Atomicity is identical and
the service is testable without a commit.

## Running it

```bash
cd backend
npm ci

export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/invoicepilot"
export SECRET_KEY="dev-only-at-least-thirty-two-characters"

npm start          # migrates, then listens on 3001
curl localhost:3001/health
```

## Tests

`node:test`, against a real PostgreSQL whose database name contains `test` —
the harness refuses anything else, because it drops and recreates the `public`
schema.

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/invoicepilot_test"
npm test
```

## The demo workspace

```bash
npm run seed -- --email demo@example.com --password "…"
```

Prints the workspace id; set it as `DEMO_WORKSPACE_ID` on both services.
`POST /api/admin/reseed`, guarded by `X-Admin-Token`, rebuilds that one
workspace and only that one. The ledger is deterministic: the same seed value
every time, anchored to the day it runs.

## Environment

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon's **pooled** connection string in production |
| `SECRET_KEY` | HS256 signing key, ≥ 32 characters, no default |
| `PORT` | Render sets it; 3001 locally |
| `ADMIN_TOKEN` | Guards `POST /api/admin/reseed`, ≥ 32 characters |
| `DEMO_WORKSPACE_ID` | The only workspace the reseed may touch |

## Frontend contract

`src/types/index.ts` in the frontend mirrors these response shapes field for
field, snake_case included, and `src/lib/api/client.ts` parses every response
with Zod at the boundary. JavaScript gives the backend no type contract to
export, so that parse is what fails loudly when a field is renamed.
```

- [ ] **Step 5: Fix the four comments that still say FastAPI**

The service they name no longer exists. Comments only — no behaviour changes.

- `src/lib/api/client.ts:9` — "The only place in the frontend that builds a URL to FastAPI." → "…that builds a URL to the API."
- `src/lib/api/session.ts:23` — "Who is signed in, according to FastAPI." → "…according to the API."
- `src/proxy.ts:15` — "…never the authorisation — FastAPI verifies every request…" → "…never the authorisation — the API verifies every request…"
- `src/types/index.ts:4` — "These mirror the FastAPI Pydantic schemas field-for-field…" → "These mirror the API's response shapes field-for-field…"

- [ ] **Step 6: Verify both sides still pass**

Run (from `backend/`): `npm test`
Expected: PASS, every suite.

Run (from the repository root): `npx tsc --noEmit && npm run build`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add -A backend src/lib/api/client.ts src/lib/api/session.ts src/proxy.ts src/types/index.ts
git commit -m "chore: delete the Python service the Express port replaces"
```

---

### Task 7: Deploy

Render runs the Express service, Vercel runs Next, one Neon database serves
both. These steps are run by a person with the three dashboards open; nothing
here is automated, and each step names what to check before moving on.

**Files:** none. This task changes no code.

- [ ] **Step 1: Provision the database**

Create a free Neon project. Copy two connection strings: the **pooled** one
(used as `DATABASE_URL` everywhere) and the direct one (kept for manual psql).
Expected: `psql "<pooled>" -c "select 1"` answers.

- [ ] **Step 2: Create the Render web service**

New → Web Service → connect this repository.

| Field | Value |
|---|---|
| Root directory | `backend` |
| Runtime | Node |
| Build command | `npm ci` |
| Start command | `node src/server.js` |
| Plan | Free |
| Health check path | `/health` |

Environment: `DATABASE_URL` (Neon pooled), `SECRET_KEY` (≥ 32 random
characters), `ADMIN_TOKEN` (≥ 32 random characters), `NODE_ENV=production`.
Leave `DEMO_WORKSPACE_ID` unset for now; `PORT` is Render's to set.

Expected: the deploy log shows `applied: 0000_schema.sql, 0001_derivation_views.sql`
then `listening on …`, and `curl https://<service>.onrender.com/health` answers
`{"status":"ok","environment":"production"}`.

- [ ] **Step 3: Seed the demo workspace**

From a local checkout, with `DATABASE_URL` pointing at the same Neon database
and `SECRET_KEY` set:

```bash
cd backend
npm run seed -- --email demo@invoicepilot.app --password "<a real password>"
```

Expected: `seeded <uuid>: {"customers":40,"invoices":460,…}` and the
`set DEMO_WORKSPACE_ID=…` line. Keep the uuid and the password.

- [ ] **Step 4: Finish the Render environment**

Add `DEMO_WORKSPACE_ID=<the uuid from step 3>` and redeploy.

Expected:

```bash
curl -i -X POST -H "X-Admin-Token: <ADMIN_TOKEN>" \
  https://<service>.onrender.com/api/admin/reseed
```

answers 200 with `"invoices":460`, and the same call with a wrong token answers
401.

- [ ] **Step 5: Configure Vercel**

On the existing project, set: `API_BASE_URL=https://<service>.onrender.com`,
`DEMO_WORKSPACE_ID=<the uuid>`, `ADMIN_TOKEN=<the same token>`. Generate
`CRON_SECRET` (Vercel offers to, when a cron exists). Deploy.

Expected: the deployment's Cron Jobs tab lists `/api/cron/reseed` at `0 4 * * *`.

- [ ] **Step 6: Verify the cron path end to end**

Trigger the cron from the Vercel dashboard (Cron Jobs → Run).

Expected: 200, and the response body reports 460 invoices. A 401 means
`CRON_SECRET` does not match; a 500 with `Reseed is not configured` means one
of the three variables is missing on Vercel.

- [ ] **Step 7: Keep the service awake**

Point a free external uptime monitor (UptimeRobot or similar) at
`https://<service>.onrender.com/health` on a five-minute interval.

Render suspends a free service after 15 minutes idle and charges roughly 50
seconds to wake it; running continuously costs 730 of the 750 free instance
hours a month, so the ping fits the budget. It is also what keeps the 04:00
cron inside its 60-second ceiling. Neon still suspends after five minutes idle
regardless, so the first query after a quiet period pays that wake-up.

Expected: the monitor reports the service up, and a cold `curl` of `/health`
answers in well under a second.

- [ ] **Step 8: The acceptance check spec §13 asks for**

Open the Vercel URL, sign in with the demo credentials from step 3, and land on
the dashboard.

Expected: the login succeeds (that is Render answering `POST /api/auth/login`),
the dashboard renders, and the demo banner appears at the top of the
application shell — the banner only renders when the session's workspace id
equals `DEMO_WORKSPACE_ID`, so seeing it proves the token, the seeded workspace
and both environments agree.

- [ ] **Step 9: Record the result**

Append a `## Status` section to this plan naming what was verified, what was
not, and any deviation. Commit:

```bash
git add docs/superpowers/plans/2026-09-16-express-backend-port-p3-seeder-and-deployment.md
git commit -m "docs: record the P3 deployment result"
```

---

## Done when

- `npm test` in `backend/` is green: every P1 and P2 suite plus
  `seed-generator`, `seed` and `admin-reseed`.
- `npm run seed` builds a 460-invoice demo workspace, and running it twice for
  the same workspace id refuses rather than doubling the ledger.
- `POST /api/admin/reseed` rebuilds only `DEMO_WORKSPACE_ID`, refuses a wrong,
  absent or wrongly-sized token, and leaves the demo user row — and therefore
  the demo password — in place.
- No Python file remains: `git ls-files backend | grep '\.py$'` is empty.
- `vercel.json` is the cron entry and nothing else.
- `npx tsc --noEmit` and `npm run build` pass at the repository root.
- The Vercel URL logs in as the demo user and renders a dashboard whose session
  came from Render.

## Self-review against the spec

| Spec section | Where P3 covers it |
|---|---|
| §7 seeder ported to `backend/src/db/seed.js`, seed value fixed | Tasks 1, 2 (anchor date: see "Corrections to the spec", item 1) |
| §7 `src/lib/data/` stays on Vercel until phase 6 | Untouched, by scope |
| §9 `POST /api/admin/reseed` guarded by `ADMIN_TOKEN` | Task 4 |
| §9 Vercel cron forwards to it | Task 5 |
| §9 `vercel.json` reduces to the cron entry | Task 5 |
| §9 Render service, env, start command | Task 7 |
| §9 free-tier budget, keep-awake ping | Task 7, step 7 |
| §11 ledger suite, deferred from P1 with the seeder it depends on | Task 2 |
| §11 CI: backend `node --test`, frontend `tsc` + build | Already switched in P1; unchanged |
| §11 manual check: log in as demo, load the dashboard | Task 7, step 8 |
| §13 every Python file deleted | Task 6 |
| §5 (free-tier spec) reseed guard 1, no public backend | **Lost** — Render's hostname is public. Recorded in Express spec §12; guards 2 and 3 are why this task does not thin them. |
| §4 (free-tier spec) one-click demo login | **Not in P3** — phase 3–6 work. P3 uses the ordinary login form. |

Not in this plan and not in this phase: the thirteen stub domains, the shared
scoping helper (P2 deferred it to the first models that need it — none of them
land here), the demo login button, and any frontend data wiring.
