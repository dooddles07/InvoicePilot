# InvoicePilot — Backend Integration Design

**Date:** 2026-09-08
**Status:** Awaiting review
**Scope:** Sub-projects 1–4 of 7 (data model, auth, read path, write path)

---

## 1. Context

The repository holds two halves that have never been connected.

**Frontend.** Complete. Roughly 60 pages and components across marketing, auth,
onboarding and the application shell. Every figure it shows is derived from a
715-line fixture ledger in `src/lib/data/seed.ts`. There is not one `fetch()` in
`src/`.

**Backend.** An honest skeleton. 14 routers, ~45 endpoints, every one returning
`501`. `app/schemas/`, `app/services/`, `app/workers/`, `app/integrations/` are
empty files. `app/repositories/` holds only its base class. Five of the
nineteen entities the README describes exist as tables.

This document specifies the work that makes them one system: a real schema, real
authentication, every screen in the core product reading from Postgres, and the
four write operations that make it an accounts receivable tool rather than a
viewer.

### Problems in the current code this design fixes

These were found while reading the repository and are corrected as part of the
work, not filed separately.

1. **`billing.py:25` guards on `workspace:write`, a permission granted to
   nobody.** Owners pass through the `*` wildcard; admins are locked out with no
   way to grant it.
2. **`integrations.py` guards a list endpoint with `integration:write`.** A read
   behind a write permission. Members and viewers cannot open a page the sidebar
   links them to.
3. **`audit.py`, `notifications.py` and `users.py` have no `require()` at all.**
   Any authenticated role can read the audit log.
4. **`workspaces.py` PATCH guards on `team:write`.** Renaming a workspace and
   inviting a member are different powers.
5. **`Invoice.balance_cents` is a Python `@property`.** It cannot be selected,
   sorted, indexed or aggregated, which the collections ranking requires.
6. **The frontend's aggregation is computed once at module import.**
   `openInvoices`, `rankedOverdue` and `rankedByCustomer` in
   `src/lib/data/index.ts` are top-level constants. There is no per-request seam,
   so "swap the data source" is not currently a swap.

---

## 2. Decisions

Settled during design. Each is load-bearing; changing one changes the plan.

| # | Decision | Consequence |
|---|---|---|
| 1 | `overdue` leaves the stored status enum | Status is lifecycle only. Overdue is always computed. No nightly job, no stale rows. |
| 2 | Derived values are computed on read | `balance_cents` is a generated column. Customer rollups and `days_overdue` come from SQL views. Nothing to keep in sync. |
| 3 | The browser never calls FastAPI | Reads via a server-side DAL, writes via Server Actions. Token in an httpOnly cookie. CORS deleted. |
| 4 | Scope is spine plus writes | Sub-projects 1–4. Automations, integrations, billing and model-backed AI are deferred. |
| 5 | Email sends use a transactional outbox | Commit the intent, then send, then mark sent. No Redis, no worker. Resend is the provider. |
| 6 | Demo seed **and** CSV import | The fixture ledger becomes a Python seeder. Onboarding gains a real upload path. |
| 7 | CORS middleware and `cors_origins` are deleted | Follows from 3. A future mobile or public API client gets its own token flow. |
| 8 | Neon for Postgres in development | No local install, same engine as production, branchable for migration testing. |

---

## 3. Architecture

### Request topology

```
Browser
   │  HTML, and Server Action POSTs. Never JSON to FastAPI.
   ▼
Next.js  (Vercel)
   │  proxy.ts          optimistic cookie check, refresh rotation
   │  src/lib/api/      the DAL — every read, cache()-memoized per render
   │  src/lib/actions/  every write, "use server"
   │
   │  fetch() with Authorization: Bearer <access token from httpOnly cookie>
   ▼
FastAPI  (private — no public origin, no CORS)
   │  routes/          validation, authz, response shape
   │  services/        business rules, owns the transaction boundary
   │  repositories/    workspace-scoped by construction
   ▼
Postgres (Neon)
```

### The three seams

**`src/lib/api/` — the Data Access Layer.** One module per domain:
`invoices.ts`, `customers.ts`, `payments.ts`, `collections.ts`, `reports.ts`,
`session.ts`. Each function reads the access-token cookie, calls FastAPI,
validates the response against a Zod schema, and returns a typed DTO. Wrapped in
React `cache()` so a page needing the same invoice in three components fetches
once per render.

This is the only place in the frontend that constructs a URL to FastAPI. Pages
import functions, never paths.

**`src/lib/actions/` — mutations.** `"use server"` functions: `login`, `signup`,
`logout`, `createInvoice`, `sendInvoice`, `recordPayment`, `sendReminder`,
`importInvoices`, `updateWorkspace`, `inviteMember`. Each validates with the
same Zod schema the form uses, calls FastAPI, and calls `revalidatePath()` on
success.

The existing dialogs keep their shape. `record-payment-dialog.tsx:87` currently
runs a `setTimeout` then `toast.success`; it becomes `await recordPayment(...)`
then a toast on the resolved result. `auth-form.tsx:80` changes the same way.

**`backend/app/services/` — the missing half of the backend.** A service owns one
use case end to end, and owns the transaction. `PaymentService.record()` inserts
the payment, updates the invoice, writes the collection event and writes the
audit entry — one commit or none of it. Routes become thin: validate, delegate,
shape. **Repositories never commit.**

### Session verification: FastAPI is the authority

The DAL does **not** verify the JWT. Next would need `SECRET_KEY` to do so, which
means sharing a signing secret across two services for no gain. Instead the DAL
forwards the token; a `401` from FastAPI triggers `redirect("/login")`.

`proxy.ts` performs only the optimistic check — cookie present or not — per the
Next 16 guidance that a proxy check must never be the only line of defence.

### Why refresh lives in `proxy.ts`

Access tokens last 30 minutes; refresh tokens 14 days. Refreshing writes a
cookie, and **Next does not permit cookie writes during a Server Component
render**. So:

- `proxy.ts` owns refresh. It runs before render, can write cookies, and swaps an
  expired access token for a fresh pair.
- The DAL only ever *reads* cookies.

This is a genuine constraint on the design, not an implementation detail.

### Contract enforcement

`src/types/index.ts` remains the source of truth for shape, but stops being
maintained by hand. The Pydantic schemas in `backend/app/schemas/` are written to
match it field-for-field, and a CI step diffs types generated from FastAPI's
OpenAPI document against the committed file. Drift becomes a failing build
rather than an `undefined` inside a currency formatter.

---

## 4. Data model

### Existing (migration 0001)

`workspaces`, `customers`, `invoices`, `invoice_items`, `payments`.

### Changes to existing tables

**`invoices`**

- Drop `overdue` from the `invoice_status` enum. Remaining values: `draft`,
  `sent`, `viewed`, `partially_paid`, `paid`, `disputed`.
- Drop the stored `risk` column. Invoice risk is the customer's risk, read from
  the view.
- Replace the `balance_cents` Python property with a real column:

```sql
balance_cents bigint GENERATED ALWAYS AS
  (GREATEST(amount_cents - paid_cents, 0)) STORED
```

`GREATEST` is immutable, so Postgres accepts it in a generated column. The value
is now indexable and sortable, which the collections ranking needs.

- Add `sent_at timestamptz`, `viewed_at timestamptz`.

**`customers`** — no structural change. All statistics move to a view.

### New tables

**`users`**
`id`, `email`, `full_name`, `avatar_url`, `password_hash`, `created_at`,
`updated_at`. Uniqueness is a functional index on `LOWER(email)` rather than a
`citext` column, so the schema needs no Postgres extension. Not
workspace-scoped — a user may belong to several.

**`refresh_tokens`**
`id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`, `replaced_by_id`,
`created_at`. Single-use with a rotation chain; see §5.

**`workspace_members`**
`id`, `workspace_id`, `user_id`, `role`, `status` (`active` | `invited`),
`invited_email`, `last_active_at`. Unique on `(workspace_id, user_id)`.

**`collection_events`**
`id`, `workspace_id`, `invoice_id`, `customer_id`, `type`, `channel`, `summary`,
`detail`, `actor`, `occurred_at`. Index `(workspace_id, invoice_id, occurred_at)`.
This is the invoice timeline.

**`communication_logs`** — the outbox
`id`, `workspace_id`, `invoice_id`, `customer_id`, `channel`, `to_address`,
`subject`, `body`, `status` (`queued` | `sent` | `failed`),
`provider_message_id`, `idempotency_key`, `error`, `queued_at`, `sent_at`.
Unique on `(workspace_id, idempotency_key)`.

**`audit_logs`**
`id`, `workspace_id`, `actor_user_id`, `actor_label`, `action`, `target_type`,
`target_id`, `ip`, `occurred_at`. Index `(workspace_id, occurred_at DESC)`.

**`email_templates`**
`id`, `workspace_id`, `name`, `tone`, `subject`, `body`, `updated_at`. Seeded
with a friendly, firm and final template per workspace at creation.

**`import_batches`**
`id`, `workspace_id`, `created_by`, `filename`, `row_count`, `accepted_count`,
`rejected_count`, `status`, `rejections` (jsonb), `created_at`.

### Deferred tables

Not created in this spec: `automations`, `automation_steps`, `automation_runs`,
`notifications`, `integrations`, `ai_insights`, `subscriptions`, `api_keys`,
`webhook_endpoints`, `payment_methods`. They belong to sub-projects 5–7.

### Derivation views

**`invoice_state`** — one row per invoice, plus everything time-derived.

```sql
CREATE VIEW invoice_state AS
SELECT
  i.*,
  c.name AS customer_name,
  (CURRENT_DATE - i.due_date) AS days_overdue,
  (i.due_date < CURRENT_DATE
     AND i.balance_cents > 0
     AND i.status NOT IN ('draft', 'paid')) AS is_overdue
FROM invoices i
JOIN customers c ON c.id = i.customer_id;
```

`days_overdue` is signed — positive past due, zero or negative otherwise —
matching the `Invoice` type.

**`customer_stats`** — the rollups the `Customer` type demands.

```sql
CREATE VIEW customer_stats AS
WITH settled AS (
  SELECT customer_id,
         AVG(paid_date - issue_date)::numeric      AS avg_days_to_pay,
         AVG((paid_date <= due_date)::int) * 100   AS on_time_rate,
         COUNT(*)                                  AS settled_count
  FROM invoices
  WHERE status = 'paid' AND paid_date IS NOT NULL
  GROUP BY customer_id
),
open AS (
  SELECT customer_id,
         SUM(balance_cents)                        AS outstanding_cents,
         SUM(balance_cents) FILTER (WHERE is_overdue) AS overdue_cents,
         COUNT(*)                                  AS open_invoice_count,
         MAX(days_overdue)                         AS oldest_open_days
  FROM invoice_state
  WHERE status NOT IN ('draft', 'paid')
  GROUP BY customer_id
)
SELECT
  c.id                                  AS customer_id,
  c.workspace_id,
  COALESCE(o.outstanding_cents, 0)      AS outstanding_cents,
  COALESCE(o.overdue_cents, 0)          AS overdue_cents,
  COALESCE(t.total_invoiced_cents, 0)   AS total_invoiced_cents,
  COALESCE(ROUND(s.avg_days_to_pay), 0) AS avg_days_to_pay,
  COALESCE(ROUND(s.on_time_rate), 0)    AS on_time_rate,
  COALESCE(o.open_invoice_count, 0)     AS open_invoice_count,
  COALESCE(o.oldest_open_days, 0)       AS oldest_open_days,
  <risk expression, §"Risk grading">    AS risk,
  <matching reason expression>          AS risk_reason
FROM customers c
LEFT JOIN settled s ON s.customer_id = c.id
LEFT JOIN open    o ON o.customer_id = c.id
LEFT JOIN totals  t ON t.customer_id = c.id;
```

`totals` is a third CTE summing `amount_cents` over all non-draft invoices per
customer. The CTEs aggregate across every workspace before the join, which is
correct because customer ids are UUIDs and globally unique; the repository still
applies the `workspace_id` filter on the way out.

`COALESCE` throughout is not decoration — a customer with no invoices must read
as zero outstanding, not `NULL`, or every arithmetic consumer downstream turns
into `NULL` as well.

### Risk grading — the single definition

Risk is currently invented by the fixture generator. It becomes one rule, stated
once, in `customer_stats`. Every consumer reads it; nothing recomputes it.

Evaluated in order, first match wins:

| Grade | Condition | `risk_reason` |
|---|---|---|
| `high` | `on_time_rate < 40` | Settles on time only *n*% of the time |
| `high` | `oldest_open_days > 60` | Carrying a balance *n* days past due |
| `medium` | `on_time_rate < 75` | On-time rate has fallen to *n*% |
| `medium` | `oldest_open_days > 14` | Balance is *n* days past terms |
| `medium` | `avg_days_to_pay > payment_terms_days + 7` | Averages *n* days against *m*-day terms |
| `low` | otherwise | Pays on terms |

A customer with no settled invoices and no open balance grades `low` with reason
"No payment history yet" — not `high`, which would flag every new customer on
the day they are created.

**`DeterministicAIService.assess_customer_risk` reads this view.** It does not
reimplement the rule. That is the whole point of putting it in one place.

### Expected recovery ranking

The ordering behind the collections queue, needs-attention and AI insights.
Ported from `src/lib/data/index.ts` unchanged in behaviour:

```sql
balance_cents
  * CASE risk WHEN 'high' THEN 2.4 WHEN 'medium' THEN 1.6 ELSE 1.0 END
  * EXP(-days_overdue / 55.0)
```

Then deduplicated to one row per customer, keeping each customer's
highest-scoring invoice — a work queue, not a list.

---

## 5. Authentication and tenancy

### Cookies

| Cookie | Contents | Lifetime | Flags |
|---|---|---|---|
| `ip_at` | Access JWT | 30 min | httpOnly, secure, sameSite=lax |
| `ip_rt` | Refresh token (opaque) | 14 days | httpOnly, secure, sameSite=lax |

Both are httpOnly, so no browser script can read either. This is what decision 3
buys.

### Signup

1. Server Action validates with the existing Zod schema in `auth-form.tsx`.
2. `POST /api/auth/signup` → create `user`, create `workspace`, create
   `workspace_member` with role `owner`, seed the three email templates.
3. Issue token pair, set cookies, redirect to `/onboarding`.

The current `auth-form.tsx` already routes signup to `/onboarding` and login to
`/dashboard`. That behaviour is preserved; only the fake `setTimeout` goes.

### Login

Argon2id verify against `users.password_hash` using the existing
`verify_password` in `core/security.py`. **A failed login returns the same `401`
and the same response time whether the email exists or not** — otherwise the
endpoint is an account-enumeration oracle.

### Refresh rotation

Refresh tokens are single-use. On `POST /api/auth/refresh`:

1. Hash the presented token, look it up.
2. If missing or expired → `401`.
3. **If already revoked → revoke the entire chain and `401`.** A revoked token
   being presented means either a replay or a stolen token; the safe response is
   to end every session descended from it.
4. Otherwise mark it revoked, set `replaced_by_id`, issue a new pair.

Tokens are stored hashed. A database disclosure must not hand over live sessions.

### The permission table, corrected

`ROLE_PERMISSIONS` in `core/security.py` gains the permissions the routes already
reference but nobody was granted, and the routes are re-guarded.

| Permission | owner | admin | member | viewer |
|---|:--:|:--:|:--:|:--:|
| `invoice:read` / `customer:read` / `payment:read` / `report:read` | ✓ | ✓ | ✓ | ✓ |
| `invoice:write` / `customer:write` / `payment:write` | ✓ | ✓ | ✓ | |
| `integration:read` | ✓ | ✓ | ✓ | ✓ |
| `integration:write` | ✓ | ✓ | | |
| `team:write` | ✓ | ✓ | | |
| `workspace:write` | ✓ | ✓ | | |
| `audit:read` | ✓ | ✓ | | |
| `apikey:write` | ✓ | ✓ | | |
| `billing:write` | ✓ | | | |

Owner keeps the `*` wildcard. Route corrections:

- `billing.py` → `billing:write` (owner only, and now explicit rather than an
  accident of an ungranted string)
- `integrations.py` GET → `integration:read`
- `audit.py` → `audit:read`
- `workspaces.py` PATCH → `workspace:write`; member routes stay `team:write`
- `users.py` `/me` → any authenticated principal, scoped to self
- `notifications.py` → any authenticated principal, scoped to self

A test asserts this table row by row. A permission matrix that drifts silently is
the failure mode worth a test.

### Workspace switching

`workspace_id` lives in the access token, never in a request body. Switching
workspace means `POST /api/auth/switch-workspace` — verify membership, issue a
new token pair for the new workspace. The existing `workspace-switcher.tsx`
calls it as a Server Action.

---

## 6. Read path

### Screens on real data after this work

Dashboard (KPIs, cash flow, aging, needs-attention, AI insights) · Invoices list
and detail · Customers list and detail · Collections pipeline · Payments ·
Reports and aging · Ask InvoicePilot · Settings: team, email templates, audit
log, security.

### Screens that stay on demo data

Automations, Integrations, Settings → API keys, Webhooks, Billing,
Notifications.

Their fixture imports move to `src/lib/demo/` and each screen carries a
persistent "Preview — not connected" banner. **This is deliberate and it is
labelled.** A product that quietly shows invented data on six screens while the
other twelve are real is worse than one that says which is which. Each banner is
deleted as sub-projects 5–7 land.

### AI in this scope

`DeterministicAIService` is implemented fully — SQL ranking, risk grading,
needs-attention notes, and the four canned questions in `answerFor()`, which are
keyword-matched over the ledger and port directly.

Deferred: the Anthropic and OpenAI providers, and free-text questions outside the
four. `AI_PROVIDER=disabled` remains the default and the product is complete
without it, exactly as the README claims.

---

## 7. Write path

Four operations. Each is one service method, one transaction, one audit entry.

### `InvoiceService.create`

Insert invoice and items in one transaction. **Reject unless
`sum(items.amount_cents) == invoice.amount_cents`** — the invariant
`verify.ts` checks for fixtures becomes a server-side rule. Audit `invoice.create`.

### `InvoiceService.send`

`draft → sent`, set `sent_at`. Write a `communication_logs` row, a
`collection_events` row of type `invoice_sent`, and an audit entry. Then deliver
per §8.

### `PaymentService.record`

One transaction:

1. Reject if `amount_cents > invoice.balance_cents`. Overpayment is a correction,
   not a payment, and silently accepting it corrupts the ledger.
2. Insert the payment.
3. Recompute `invoice.paid_cents` as `SUM(payments.amount_cents)` for that
   invoice — recomputed, never incremented, so a retry cannot double-count.
4. Set status: `paid` and `paid_date` when balance reaches zero, else
   `partially_paid`.
5. Write `collection_events` of type `payment_received`.
6. Audit `payment.record`.

### `ReminderService.send`

1. Build the idempotency key: `sha256(invoice_id + tone + current_date)`.
2. Insert `communication_logs` as `queued`. **A unique-violation means a reminder
   already went out for this invoice, at this tone, today** — return the existing
   row rather than sending again. This is what stops a double-clicked button from
   chasing a customer twice.
3. Commit.
4. Deliver per §8.
5. **On successful delivery only:** update `invoices.last_contacted_at`, write
   `collection_events` of type `reminder_sent`, audit `reminder.send`. A failed
   send marks the `communication_logs` row `failed` and writes nothing else — the
   invoice timeline must never show a reminder the customer never received,
   because the next person to open that invoice will decide what to do based on
   it.

---

## 8. Email delivery — the outbox

Provider: **Resend**, via `vercel integration add resend/resend-email`. It was
the only messaging integration returned by `vercel integration discover
--category messaging`. It is provisioned before any send code is written; no
mock stands in for it.

The sequence, for every outbound message:

```
write communication_logs (status=queued)  →  COMMIT
                                             │
                              call Resend ───┤
                                             │
        UPDATE status=sent, provider_message_id  (or status=failed, error)
```

**Why commit before sending.** A crash between the commit and the send leaves a
row visibly stuck at `queued`. The alternative — send first, then write — can
produce an audit log claiming a customer was contacted when they were not. In a
collections product that is the one lie that matters, because someone will act on
it in a phone call.

Stuck rows are visible in Settings → Audit log, filtered to `queued`, and are
re-sendable by hand.

**This table is the seam for sub-project 6.** When Dramatiq arrives, the worker
drains exactly these rows and the send call moves out of the request. No write
path is rewritten.

### Known constraint

Resend delivers only to the account owner's own address until a sending domain is
verified with DNS records. Local development cannot email a real customer address
until you own a domain. This is a Resend rule, not something the design can work
around.

---

## 9. CSV import

Onboarding step 3 becomes a real upload. Four stages, and the third is the one
that matters.

1. **Upload.** Multipart to `POST /api/imports`. Parsed with Python's `csv`;
   nothing is written yet.
2. **Map.** Columns guessed from headers, corrected by the user. Required:
   customer name, customer email, invoice number, amount, issue date, due date.
   Optional: status, amount paid, PO number, payment terms.
3. **Preview.** Every row validated and shown with its verdict. Amounts parsed
   via `Decimal` to integer cents — **never `float`**, which is the same rule the
   schema follows. Dates parsed against an explicit format chosen by the user,
   because `03/04/2026` is two different days depending on where the file came
   from. Rows are rejected for: unparseable amount or date, duplicate invoice
   number within the workspace, invalid email.
4. **Commit.** One transaction containing every *accepted* row. Customers upserted
   on `(workspace_id, email)`, invoices inserted. Rejected rows were excluded at
   stage 3 and are not failures — they are already on screen with their line
   numbers and reasons before the user commits. If the transaction itself fails,
   nothing at all is applied.

The user therefore sees the accepted and rejected counts *before* committing, so
nobody discovers afterwards that a third of their ledger silently vanished. The
outcome, including the rejection list, is recorded in `import_batches`.

---

## 10. Demo seed

`src/lib/data/seed.ts` is ported to `backend/scripts/seed_demo.py`. The
mulberry32 generator and the fixed reference date carry over, so the dataset stays
deterministic and reproducible.

Onboarding's skip path provisions this demo workspace, which is what
`onboarding-flow.tsx:299` already promises the user.

`src/lib/data/verify.ts` is not deleted. Its invariants become backend tests
against the seeded database:

- money is integer cents, amounts positive
- `0 <= balance_cents <= amount_cents`
- line items sum to the invoice total
- a `paid` invoice carries no balance
- a `paid_date` implies status `paid`
- aging buckets partition the open ledger exactly once, by both value and count
- bucket shares sum to 100%

That is the most valuable logic in the current mockup and it transfers directly.

---

## 11. Error handling

**FastAPI.** A single exception handler maps domain errors to status codes:
validation → `422`, not-found or cross-tenant → `404` (never `403`, which would
confirm the record exists in another workspace), permission → `403`, auth →
uniform `401`. Unhandled exceptions log with a request id and return a generic
`500`; internals never reach the client.

**DAL.** A `401` redirects to `/login`. A `404` calls `notFound()`. Anything else
throws and is caught by the existing `src/app/(app)/error.tsx`, which is already
built.

**Server Actions.** Return a discriminated result rather than throwing, so forms
render field errors instead of replacing the page with an error boundary. Toasts
report the resolved outcome — a failed send says so, rather than the current
unconditional `toast.success`.

**Empty states.** `src/components/invoicepilot/empty-state.tsx` already exists and
is used for genuinely empty workspaces, which now actually occur.

---

## 12. Testing

Backend, `pytest`. One runnable check per non-trivial rule, not a suite per
function:

- **Tenancy.** A repository built for workspace A cannot read, update or delete a
  row in workspace B. This is the guarantee everything else rests on.
- **Permission matrix.** The table in §5, asserted row by row.
- **Refresh rotation.** A reused refresh token revokes its whole chain.
- **Payment transaction.** `sum(payments) == invoice.paid_cents` after recording;
  overpayment rejected; a failed step leaves nothing behind.
- **Reminder idempotency.** Two sends of the same invoice, tone and day produce
  one `communication_logs` row and one email.
- **Derivation views.** The seven `verify.ts` invariants, against the seeded
  database.
- **CSV import.** Malformed amounts, ambiguous dates and duplicate invoice
  numbers are rejected with the right line numbers; a failing commit applies
  nothing.

Frontend: the OpenAPI-to-TypeScript contract diff in CI. The existing
`test_security.py` is kept and extended.

---

## 13. Build order

Phases are sequential; each leaves the repository working.

| Phase | Work | Done when |
|---|---|---|
| 1 | Migration 0002: new tables, enum change, generated column, views. Seeder. | `seed_demo.py` populates Neon; view invariant tests pass |
| 2 | Auth: services, endpoints, cookies, `proxy.ts`, DAL session, permission table | Real login reaches a real (empty) dashboard |
| 3 | Read path: schemas, repositories, read services, DAL modules, pages converted | Every screen listed in §6 renders from Postgres; fixtures unused by them |
| 4 | Write path: four services, outbox, Resend, audit. Dialogs converted. | An invoice can be created, sent, and paid |
| 5 | CSV import: parse, map, preview, commit | A real ledger imports through onboarding |
| 6 | Cleanup: delete `src/lib/data/`, delete CORS, move deferred screens to `src/lib/demo/` with banners | No fixture import outside `src/lib/demo/` |

---

## 14. Out of scope

Deferred to sub-projects 5–7, each getting its own spec:

- **Automations engine** — the tree-to-flat-steps mapping between the frontend's
  recursive `AutomationNode` and `automation_steps`, a scheduler, a worker, and a
  run state machine. It is much better designed against a database that already
  holds real invoices.
- **Integrations** — QuickBooks, Xero, Stripe, Gmail, Twilio. Each is an OAuth
  handshake plus a sync reconciler against an API that cannot be tested without
  credentials.
- **Dramatiq and Redis** — arrives with automations. The outbox in §8 is its
  insertion point.
- **Model-backed AI** — the Anthropic and OpenAI providers, and free-text
  questions. `DeterministicAIService` is the baseline they must beat.
- **Billing** — subscriptions, plan changes, usage metering.
- **API keys and webhooks** — including the HMAC signing the README describes.
- **Rate limiting** — described in the README, not yet built. It belongs with the
  public API surface, which does not exist while FastAPI is private.
- **Notifications** — the in-app notification centre.
