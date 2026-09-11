# InvoicePilot — Free-Tier Deployment and Phases 3–6

**Date:** 2026-09-11
**Status:** Awaiting review
**Scope:** Deployment topology, demo access, and the remaining phases of the
backend integration spec (read path, write path, CSV import, cleanup)
**Supersedes:** nothing. Extends
`2026-09-08-invoicepilot-backend-integration-design.md`, whose phases 1 and 2
are complete and merged.

---

## 1. Context

The backend integration spec described a system and a build order. Phases 1 and
2 are done: the schema, derivation views and deterministic seeder exist, and
signup, login, logout, refresh rotation and the session DAL are real. Every
screen still reads from `src/lib/data/`.

This document covers the two things that spec did not: **where the system runs**,
and the design decisions the remaining four phases need in order to run there.

The destination is a portfolio piece. A visitor clicks a link and the product
works — not a README describing a product that works. That constraint, plus
free-tier-only hosting, is what the decisions below answer to.

### What is already true

- Phases 1 and 2 merged. `main` is clean.
- `vercel.json` declares two Vercel services, frontend and backend.
- `src/lib/api/client.ts` exists: token from cookie, Zod validation, the
  401/404 error policy. It is the only place in the frontend that builds a
  FastAPI URL.
- `src/proxy.ts` performs the optimistic cookie check and refresh rotation.
- `node_modules/` is not installed in this checkout.

---

## 2. Decisions

| # | Decision | Consequence |
|---|---|---|
| 1 | One Vercel project, two services, one Neon database | No Redis, no Upstash, no second host. Nothing to pay for. |
| 2 | The backend service gets no public rewrite | FastAPI is unreachable from the internet. Spec decisions 3 and 7 survive deployment. |
| 3 | Next calls FastAPI over a **service binding** | `API_BASE_URL` is injected and deployment-aware, so previews pair with previews. |
| 4 | Refresh rotation moves out of `proxy.ts` into a Route Handler | Bindings do not resolve in middleware. This is a platform constraint, not a preference. |
| 5 | The six deferred screens stay banner-parked | Automations, Integrations, API keys, Webhooks, Billing, Notifications remain previews, per spec §6. |
| 6 | One-click demo login into a shared workspace, seated as **admin** | A visitor sees a populated product without typing credentials, and can exercise the write path. |
| 7 | A daily cron re-seeds the demo workspace | Hobby crons run at most once a day. That is enough to keep the demo honest. |
| 8 | Email delivery is the outbox with no provider | The full spec §8 sequence runs; only the network call is absent. Resend becomes one function body later. |
| 9 | Deploy the working spine before building phases 3–6 | Platform surprises cost less against a login screen than under four phases of new code. |
| 10 | No frontend test framework | `npm run build`, `tsc --noEmit` and a grep gate are the frontend checks. Every data rule worth testing is in Python. |

### Free-tier facts these decisions rest on

Verified 2026-09-11:

- Vercel **Services** is in beta and available on all plans, Hobby included.
  Each service builds separately and runs as a Vercel Function under Fluid
  compute. A service is internal by default and becomes public only through a
  top-level rewrite.
- **Service bindings** grant private service-to-service access and inject the
  target's URL as an environment variable. They resolve at runtime in functions
  only: *code running in middleware cannot call another service over a binding*.
- Vercel **cron jobs**: 100 per project on every plan, but the Hobby plan
  rejects any expression firing more than once a day, runs in UTC, and
  guarantees timing only within the hour.
- **Neon free plan**: 0.5 GB storage, 100 compute-hours per month, autosuspend
  after 5 minutes idle, and a pooled (PgBouncer) connection string intended for
  serverless callers.

The services docs carry a "Permissions Required: Services" marker. If the
account cannot enable services, phase 0 halts and the backend host is
redesigned before anything else is built.

---

## 3. Deployment topology

```
                    Internet
                       │
                       ▼  (the only public rewrite)
          ┌────────────────────────┐
          │  frontend  (Next.js)   │
          │  proxy · pages · DAL   │
          │  Server Actions        │
          └───────────┬────────────┘
                      │  binding: API_BASE_URL (injected)
                      ▼
          ┌────────────────────────┐
          │  backend  (FastAPI)    │   no rewrite — not routable
          └───────────┬────────────┘
                      ▼
              Neon Postgres (pooled endpoint)
```

### `vercel.json`

```json
{
  "services": {
    "frontend": {
      "root": ".",
      "framework": "nextjs",
      "bindings": [
        {
          "type": "service",
          "service": "backend",
          "format": "url",
          "env": "API_BASE_URL"
        }
      ]
    },
    "backend": {
      "root": "backend",
      "framework": "fastapi",
      "entrypoint": "app.main:app"
    }
  },
  "rewrites": [
    { "source": "/(.*)", "destination": { "service": "frontend" } }
  ],
  "crons": [{ "path": "/api/cron/reseed", "schedule": "0 4 * * *" }]
}
```

The backend's rewrite from the current file is **deleted**. That rewrite made
FastAPI a public origin on the same domain, which contradicts spec decisions 3
and 7.

`API_BASE_URL` is generated by the binding. It is never set by hand, and
`client.ts` already reads it.

### Session refresh moves to a Route Handler

`proxy.ts` currently calls FastAPI's `/api/auth/refresh` directly. Bindings do
not resolve in middleware, so that call cannot reach a private backend.

- `proxy.ts` keeps the optimistic cookie check. On "no `ip_at`, valid-looking
  `ip_rt`" it rewrites to `/api/session/refresh?next=<pathname>` instead of
  fetching.
- `src/app/api/session/refresh/route.ts` calls FastAPI over the binding, sets
  `ip_at` and `ip_rt` with the existing `sessionCookieOptions`, and redirects to
  `next`. Route Handlers may write cookies and bindings resolve there.
- Rotation failure clears both cookies and redirects to `/login`, preserving
  today's behaviour exactly: without the clear, every subsequent navigation
  retries a rotation that cannot succeed.
- The `next` parameter is validated as a same-origin relative path before the
  redirect. An unchecked redirect target is an open redirect.

The rotation logic itself — the `rotate()` function — moves from `proxy.ts` to
the route handler unchanged.

### Backend changes for serverless

1. **`config.py` drops `redis_url`.** Dramatiq belongs to sub-project 6. A
   required setting for a service that does not exist fails every deploy at
   startup.
2. **`requirements.txt` keeps runtime dependencies only.** `redis`, `dramatiq`,
   `ruff`, `pytest`, `httpx` and `anyio` move to `requirements-dev.txt`. The
   function bundle should not carry the test suite's dependencies.
3. **`get_engine()` uses `poolclass=NullPool`** against Neon's pooled
   connection string. A SQLAlchemy connection pool inside a function that may be
   frozen between invocations is a pool of dead sockets; PgBouncer owns pooling
   here. `pool_pre_ping` is dropped with the pool.

### Environment variables

| Service | Variable | Notes |
|---|---|---|
| backend | `SECRET_KEY` | ≥ 32 bytes, as `config.py` already enforces |
| backend | `DATABASE_URL` | Neon **pooled** connection string |
| backend | `ADMIN_TOKEN` | Guards the reseed endpoint |
| backend | `DEMO_WORKSPACE_ID` | The only workspace reseed may touch |
| backend | `ENVIRONMENT` | `production` |
| frontend | `API_BASE_URL` | Injected by the binding. Never set by hand |
| frontend | `DEMO_EMAIL`, `DEMO_PASSWORD` | Credentials for the demo login action |
| frontend | `DEMO_WORKSPACE_ID` | Decides whether the demo banner renders |
| frontend | `ADMIN_TOKEN` | Same value as the backend's; the cron handler forwards it |
| frontend | `CRON_SECRET` | Vercel's cron authentication header |

Migrations run with `alembic upgrade head` against Neon's **direct**
(unpooled) connection string, from a developer machine. A migration through a
transaction pooler is a way to lose a migration halfway.

---

## 4. Demo access

### Entry

A "View the demo" button on the marketing hero and on the login page calls a
Server Action that reuses the existing `login()` action with `DEMO_EMAIL` and
`DEMO_PASSWORD`. No new endpoint, no new authentication path, no credentials in
client-side code.

### Role: admin

The demo user is an `admin` member of the demo workspace.

`viewer` cannot write, which hides the entire write path from the person the
demo exists for. `member` cannot read the audit log — `audit:read` is
owner/admin — and the audit log is one of the screens worth showing. `owner`
would additionally grant `billing:write`, which belongs to a parked preview
screen.

### Daily reset

One cron, `0 4 * * *` UTC, hits `/api/cron/reseed` in the frontend service.
That handler verifies Vercel's `CRON_SECRET` header, then calls
`POST /api/admin/reseed` over the binding with an `X-Admin-Token` header.

The backend handler deletes the demo workspace's rows and re-runs the seeder in
one transaction.

`crons` is not listed among the per-service configuration fields, and the
services documentation does not state where it belongs in services mode. Phase 0
verifies it at the top level. If it is rejected there, the fallback is a
scheduled GitHub Actions workflow calling the same public
`/api/cron/reseed` path with a shared secret header — free for a public
repository, and not bound to the once-a-day Hobby cadence.

**This endpoint deletes data, so it carries three independent guards. Each one
alone is sufficient to prevent misuse:**

1. The backend service has no public rewrite, so the endpoint is not reachable
   from the internet at all.
2. The handler requires `X-Admin-Token` to equal `ADMIN_TOKEN`, which exists
   only in the backend service environment. A missing or incorrect token returns
   401 before any query runs.
3. The handler ignores any workspace identifier in the request and operates
   only on `DEMO_WORKSPACE_ID`. There is no code path by which it can delete a
   real user's workspace.

`backend/scripts/seed_demo.py` is refactored so its body becomes
`seed_demo(session, workspace_id)`. The script and the endpoint call the same
function, so the demo data has one definition and stays deterministic.

### Labelling

A slim persistent bar renders on every application screen while the current
workspace is the demo workspace: "Demo workspace — resets daily at 04:00 UTC."

The same component renders the "Preview — not connected" banner for the six
deferred screens. One component, two messages.

---

## 5. Read path (phase 3)

The derivation views already exist in migration 0003: `invoice_state`,
`customer_stats`, `collection_queue`. The read path is plumbing, not SQL.

### Backend

Per domain — invoices, customers, payments, collections, reports, AI, settings —
four pieces:

- a Pydantic schema in `app/schemas/`, matching `src/types/index.ts`
  field for field;
- a repository extending the existing `WorkspaceRepository`, so the
  `workspace_id` filter stays impossible to forget;
- a thin read service;
- the router's `501` replaced.

Repositories for derived data map the views as SQLAlchemy `Table` objects and
select from them. Nothing recomputes a rule that lives in SQL.
`DeterministicAIService` reads `collection_queue` and `customer_stats`; it does
not re-rank in Python.

### Endpoint shape

REST per resource for invoices, customers, payments and collections.

One composite endpoint, `GET /api/reports/dashboard`, returns KPIs, cash flow,
aging, needs-attention and insights together. The dashboard needs five
aggregates that always render together; five serverless round trips per page
load is five opportunities for a cold start against a free tier.

This is a deliberate coupling of one endpoint to one screen, and it is the only
one.

### Frontend

`src/lib/api/` gains `invoices.ts`, `customers.ts`, `payments.ts`,
`collections.ts`, `reports.ts`, `ai.ts` and `settings.ts`, each built on the
existing `apiFetch` and wrapped in React `cache()`.

**The DAL mirrors `src/lib/data/index.ts` function for function.** `getKpis`,
`getCashFlow(range)`, `getAging`, `getPipeline`, `getNeedsAttention`,
`getAIInsights`, `answerFor`, `getInvoice`, `getCustomer`,
`getCustomerInvoices`, `getInvoiceEvents`, `getCustomerEvents`,
`getCustomerPayments`, `getPaymentBehaviour` and `getTopCustomers` keep their
names and their return types. A page's diff is its import line plus `await`.

The fixture module was the contract all along; only its implementation moves to
Postgres.

**Consequence.** These functions become `async`, so their callers must be
Server Components. Screens that call them from a client component receive the
data as props from the page instead. That is a real diff on a handful of files,
and it is not a rewrite.

### Deviation from the backend integration spec

Spec §3 requires a CI step diffing types generated from FastAPI's OpenAPI
document against `src/types/index.ts`. **This design drops it.**

`apiFetch` already validates every response against a Zod schema at the single
seam where FastAPI data enters the frontend. Drift fails loudly, with a precise
message, in tests and in development. The generator would add a dependency, a
committed generated artifact and a build step to maintain, for a signal that is
already present.

---

## 6. Write path (phase 4)

Four services, exactly as spec §7 specifies, each one transaction and one audit
entry: `InvoiceService.create`, `InvoiceService.send`, `PaymentService.record`,
`ReminderService.send`.

The invariants are unchanged and are restated here only because they are the
reason the services exist:

- line items must sum to the invoice total, or the create is rejected;
- a payment exceeding `balance_cents` is rejected;
- `paid_cents` is recomputed as `SUM(payments.amount_cents)`, never
  incremented, so a retry cannot double-count;
- a reminder's idempotency key is `sha256(invoice_id + tone + current_date)`,
  and a unique violation returns the existing row rather than sending again.

### Delivery without a provider

The outbox sequence from spec §8 is unchanged: write `communication_logs` as
`queued`, commit, deliver, then record the outcome. Only the deliverer changes.

```python
# app/integrations/email.py
def send(message: CommunicationLog) -> DeliveryResult
```

With no provider configured it returns success without a network call and
stamps `provider_message_id = "outbox:<uuid>"`.

The service receives the sender as an argument. A test injects a failing sender
and asserts the failure branch: the row is marked `failed`, no
`collection_events` row is written, no audit entry is written, and
`invoices.last_contacted_at` is untouched. Production never exercises that
branch; the test does, because "the timeline must never show a reminder the
customer never received" is the rule that matters and it must not rot.

Resend later becomes one function body. No write path is touched.

### The email must be visible

A "Send reminder" click with no observable effect reads as broken.

The invoice timeline receives its `reminder_sent` event as specified, and that
event opens a dialog rendering the stored `subject` and `body` from
`communication_logs`. The demo shows the message that would have been sent,
read from the real row.

### Server Actions

`createInvoice`, `sendInvoice`, `recordPayment`, `sendReminder`,
`updateWorkspace` and `inviteMember` in `src/lib/actions/`. Each validates with
the same Zod schema its form uses, returns a discriminated result rather than
throwing, and calls `revalidatePath` on success.

The existing dialogs keep their shape. `record-payment-dialog.tsx`'s
`setTimeout` followed by an unconditional `toast.success` becomes an awaited
action with a toast reporting the resolved outcome — including failure.

---

## 7. CSV import (phase 5)

Four stages, as spec §9 specifies. The free tier changes only where the file
lives between them.

There is no blob storage and no server-side scratch state:

1. **Upload.** A Server Action forwards the file to `POST /api/imports/parse`
   over the binding. The backend parses it with Python's `csv`, guesses column
   mappings from the headers, and returns rows plus guesses. Nothing is written.
2. **Map.** The browser holds the parsed result in component state; the user
   corrects the guessed mapping.
3. **Preview.** Every row is validated and shown with its verdict and line
   number.
4. **Commit.** The accepted rows are posted as JSON to
   `POST /api/imports/commit`.

**Every row is validated again at commit, server-side.** The preview verdicts
travelled through the browser and are therefore untrusted input; the commit
re-runs the same validator and acts only on its own verdicts. The client's
verdicts drive display and nothing else.

The rules are unchanged: amounts parsed through `Decimal` to integer cents and
never `float`; dates parsed against a format the user chooses; rows rejected for
an unparseable amount or date, a duplicate invoice number within the workspace,
or an invalid email; customers upserted on `(workspace_id, email)`; one
transaction containing every accepted row; the outcome and the rejection list
recorded in `import_batches`.

Limits, enforced server-side and stated in the upload UI: **2 MB and 2,000
rows**. `next.config.ts` sets `serverActions.bodySizeLimit: "4mb"`, above Next's
1 MB default.

```python
# ponytail: parsed rows round-trip through the browser instead of server-side
# storage; caps an import at ~2k rows. Stream to blob storage if it needs more.
```

---

## 8. Cleanup (phase 6)

`src/lib/data/seed.ts` and the fixture derivations move to `src/lib/demo/`,
retained only for the six banner-parked screens: Automations, Integrations,
API keys, Webhooks, Billing, Notifications. Every other screen imports from
`src/lib/api/`.

`src/lib/data/verify.ts` is deleted; its invariants are already backend tests.

A CI grep gate fails the build on any import of `@/lib/demo` from outside those
six routes. Without the gate, "which screens are real" decays into a
code-reading exercise within a month.

---

## 9. Build order

Each phase is a branch with its own plan document under
`docs/superpowers/plans/`, matching the two already there. Each leaves the
repository working and deployed.

| Phase | Work | Done when |
|---|---|---|
| 0 | `vercel.json` services and binding; refresh Route Handler; drop `redis_url`; split requirements; `NullPool` on the pooled URL; Alembic against Neon; seeded demo workspace; demo login button; reseed endpoint and cron | The deployed URL logs in as demo and renders a real dashboard |
| 3 | Read path: schemas, repositories, read services, DAL modules, pages converted | Every screen in spec §6 renders from Postgres |
| 4 | Write path: four services, outbox, audit, dialogs converted | An invoice can be created, sent and paid; a reminder logs once |
| 5 | CSV import: parse, map, preview, commit | A real ledger imports through onboarding |
| 6 | Cleanup: `src/lib/demo/`, banners, grep gate | No `@/lib/demo` import outside the six parked routes |

Phase 0 comes first deliberately. Platform surprises — the services permission,
the binding environment variable, Neon pooling, Alembic against a serverless
database — are cheap to resolve against a login screen and expensive to resolve
underneath four phases of new code. It also produces a working link on day one.

Phase numbering continues the backend integration spec; its phases 1 and 2 are
complete.

---

## 10. Verification

**Backend, `pytest`.** The checks spec §12 lists, extended per phase:

- tenancy: a repository built for workspace A cannot read, update or delete a
  row in workspace B;
- the permission matrix, row by row;
- refresh rotation: a reused token revokes its whole chain;
- the payment transaction: totals recomputed, overpayment rejected, a failed
  step leaving nothing behind;
- reminder idempotency: two sends of the same invoice, tone and day produce one
  `communication_logs` row and one delivery;
- reminder failure: an injected failing sender writes no event, no audit entry
  and no `last_contacted_at`;
- the derivation view invariants ported from `verify.ts`;
- CSV import: malformed amounts, ambiguous dates and duplicate invoice numbers
  rejected with correct line numbers; a failing commit applies nothing;
- reseed: the endpoint refuses a wrong `X-Admin-Token`, and touches only
  `DEMO_WORKSPACE_ID`.

**Frontend.** No test framework is added. `npm run build`, `tsc --noEmit` and
the `@/lib/demo` grep gate are the checks. Every data rule worth testing lives
in Python, and a component test suite for a portfolio frontend is cost without
a matching risk.

**CI.** One GitHub Actions workflow on push: `pytest`, `npm run build`,
`tsc --noEmit`, grep gate. Free for a public repository.

---

## 11. Known constraints

- **`node_modules/` is not installed** in this checkout, so the Next 16 guides
  under `node_modules/next/dist/docs/` cannot be read until `npm install` runs.
  They must be read before `proxy.ts` or the refresh Route Handler is edited.
- **Vercel services requires a permission** on the account. If it is
  unavailable, phase 0 stops and the backend host is reconsidered before any
  other work.
- **Hobby crons fire at most once a day**, in UTC, with timing guaranteed only
  within the hour. The demo can therefore drift for up to 24 hours.
- **`crons` placement in services mode is unverified.** It is not a per-service
  field, and the services documentation does not confirm it at the top level.
  Phase 0 settles it; §4 names the fallback.
- **Neon's free plan suspends after 5 minutes idle.** The first request after a
  quiet period pays a wake-up, on top of a function cold start.
- **No email leaves the system.** Every send is an outbox row. This is decision
  8, and the demo labels it.

---

## 12. Out of scope

Unchanged from the backend integration spec §14: the automations engine,
third-party integrations, Dramatiq and Redis, model-backed AI, billing, API keys
and webhooks, rate limiting, and the notification centre. Those are
sub-projects 5–7, and their screens carry the preview banner until they land.
