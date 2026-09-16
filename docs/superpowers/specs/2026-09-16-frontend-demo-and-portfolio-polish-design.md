# Frontend demo access and portfolio polish — design

**Date:** 2026-09-16
**Status:** approved, ready for an implementation plan
**Scope:** frontend only. No backend code changes. The backend read-path
conversion (app screens reading Postgres instead of fixtures) is deliberately
deferred to a later piece of work.

## Context

InvoicePilot is a portfolio project: a Next.js 16 frontend on Vercel, an
Express API on Render, and Postgres on Neon, all on free tiers. The frontend is
substantially complete — 37 routes build clean, a documented design system in
`design-system/invoicepilot/MASTER.md`, per-segment loading skeletons, error
boundaries, centralised motion with a reduced-motion fallback, and a marketing
site with JSON-LD, a sitemap, `llms.txt` and honest disclaimers on its
testimonials and statistics.

Authentication is real: signup, login, refresh rotation and session reads run
against the Express service and Neon. Every application screen still reads the
deterministic ledger in `src/lib/data/`.

The problem this design solves is that none of that is reachable. The
application lives behind `proxy.ts`, so an anonymous visitor who clicks "Live
demo" in the footer is redirected to `/login`. The only way in is a signup form
requiring a ten-character password, and the first request after it pays a
measured 21.8-second Render cold start with no waiting UI. A visitor evaluating
this project in ninety seconds sees a marketing page and a login form, and never
sees the thirty screens behind them.

Three secondary problems compound it: sharing the link produces no social
preview card, the site's canonical URL points at `invoicepilot.com` — a domain
the author does not own — and the README is still create-next-app boilerplate.

## Goals

1. An anonymous visitor reaches the dashboard in one click, with the cold start
   made invisible or at least honest.
2. Actions inside the application visibly change the screen, so the product
   does not read as a set of screenshots.
3. The repository and the shared link present the project as finished work.

## Non-goals

- Converting application screens from fixtures to the API. Later work.
- Adding a frontend test framework. None exists today; one CSS-adjacent change
  does not justify installing one.
- A PWA manifest, offline support, or analytics.
- Changing the marketing page's structure or content strategy. The copy,
  pricing model, comparison table and FAQ are already strong and stay.

---

## 1. Demo entry and cold start

### `enterDemo()` server action

New file `src/lib/actions/demo.ts`, following the shape of
`src/lib/actions/auth.ts`: it returns an `ActionResult` rather than throwing, so
a failure re-renders the page with a message instead of replacing it with the
error boundary.

It reads `DEMO_EMAIL` and `DEMO_PASSWORD` from the environment, posts them to
the same `/auth/login` path the existing login action uses, sets the same
session cookies through `setSessionCookies`, and redirects to `/dashboard`.

This adds no new authentication surface. It is an ordinary login the visitor
does not have to type. The demo account is the one created by
`npm run seed -- --email … --password …` in `backend/`, and it is already scoped
to the workspace that `DEMO_WORKSPACE_ID` names, so `DemoBanner` renders for it
without further work.

### `/demo` route

A client page at `src/app/demo/page.tsx`, outside the `(app)` group so
`proxy.ts` does not redirect it to `/login`. `"/demo"` is added to the
`SIGNED_OUT_ONLY` array in `src/proxy.ts`, which sends a visitor who already
has a session straight to `/dashboard` instead of logging them in again.

On mount it calls `enterDemo()`. While the call is in flight it shows what is
actually happening — "Waking the demo server. Free tier, about 20 seconds." —
with an indeterminate progress indicator and a one-line explanation that the
API sleeps after fifteen minutes idle. This is a deliberate choice to explain
the free-tier constraint rather than hide it; a visitor who understands why they
are waiting waits, and the explanation itself reads as engineering awareness.

### `/api/warm` route handler

`src/app/api/warm/route.ts`: a `GET` that fetches `${API_BASE_URL}/health` with
`cache: "no-store"` and returns 204 regardless of outcome. Every error is
swallowed — a failed warm-up must never surface on the landing page.

The landing page fires it once on mount, and every demo CTA fires it on
`pointerenter`. A visitor who reads the hero for twenty seconds before clicking
pays no wait at all.

### CTA placement

- Hero primary action becomes **View live demo** → `/demo`. "Start free" drops
  to the secondary slot. The demo is the higher-intent action for this
  audience, and it is the one that shows the work.
- The marketing header gains a demo link.
- `src/components/marketing/site-chrome.tsx:120` points "Live demo" at
  `/dashboard`, which redirects to `/login`. Repointed to `/demo`.
- `/login` gains an "or enter the demo" link, so a visitor who arrived at the
  form still has a way in.

Copy for these CTAs comes from the `marketing-skills:copywriting` skill; their
placement from `marketing-skills:cro`.

### Keep-awake

An UptimeRobot (or equivalent) HTTP monitor on
`https://invoicepilot-0sc2.onrender.com/health` at a 5-minute interval. This is
a dashboard step outside the repository, and it closes the open item recorded in
`docs/superpowers/plans/2026-09-16-express-backend-port-p3-seeder-and-deployment.md`.
Vercel Hobby cron jobs fire once per day and cannot serve this purpose.

---

## 2. In-session liveness

Fifteen actions across the application currently show a toast and change
nothing. The rule for fixing them: **an action changes what is on screen
wherever the component already owns its data on the client.** No global
client-side mutation store — that layer exists to be deleted the moment the
backend read path lands, and building it now is work thrown away twice.

### Tables

`src/components/invoices/invoices-table.tsx` receives `invoices` as a prop and
derives its rows through `useMemo`. It changes to hold a `useState` copy.

- "Mark as paid", from both the row menu and the bulk bar, sets the invoice's
  status to paid, zeroes its balance and clears its risk. The row leaves the
  "open" age filter, and the table's own counts recompute from the row model
  without further changes.
- "Send reminder" stamps the row as reminded today.

`payments-table.tsx` and `customers-table.tsx` have no write actions and are
untouched.

### Dialogs

`record-payment-dialog.tsx` and `send-reminder-dialog.tsx` gain an optional
`onDone(result)` prop. Callers apply the local change; the default behaviour
stays toast-only, so every existing call site keeps working unchanged.

### Invoice detail

`src/app/(app)/invoices/[id]/page.tsx` is a Server Component. A new client
wrapper takes the server-rendered invoice as initial state and owns the balance
figure, the status badge and the timeline, so recording a payment there moves
the same three things it moves in the table.

### The mutation itself

The transformation — invoice plus payment produces an updated invoice — is a
pure function in `src/lib/data/` (alongside the existing derivations), not
logic embedded in a component. That keeps it testable without a React renderer,
and it is the same function a future optimistic update will call once writes are
real.

### Already alive

`collections/pipeline-board.tsx` mutates local board state on drag, settings
toggles hold their own state, and the automation builder edits its own graph.
No work.

### Deliberate limit

"New invoice" keeps its current behaviour: toast, then redirect to the list,
where the created invoice does not appear. Making it appear requires state that
crosses a navigation, which is precisely what the backend write path will
provide. The limit is recorded as a `ponytail:` comment in
`new-invoice-form.tsx` naming the ceiling and the upgrade path.

### Honesty fix

`src/components/invoicepilot/demo-banner.tsx` currently reads "Everything you
change here is real until then", which is false while screens read fixtures. It
is reworded to state three true things: the workspace is shared with every
visitor, it resets daily at 04:00 UTC, and changes made in the interface live in
this browser session until the backend read path lands.

---

## 3. Portfolio packaging

### One real URL

`SITE.url` in `src/lib/marketing.ts` resolves, in order:
`NEXT_PUBLIC_SITE_URL`, then `https://${VERCEL_PROJECT_PRODUCTION_URL}` (which
Vercel sets in production), then `http://localhost:3000`. `metadataBase` is set
in `src/app/layout.tsx` from the same value, so canonicals and OG image paths
resolve absolute.

`public/robots.txt:37` hardcodes the sitemap at the fake domain. It moves to
`src/app/robots.ts` so it reads the same constant and cannot drift again.

`src/app/(app)/settings/page.tsx:29` displays `invoicepilot.com/{slug}` as a
workspace vanity URL. That is in-product cosmetic text, not a crawler-visible
claim, and it stays.

### Social preview

`src/app/opengraph-image.tsx`, using `ImageResponse` from `next/og` — built into
Next, so no dependency is added. 1200×630, drawn with the design system's
colours: product name, tagline and a strip of KPI figures so the card reads as
the product rather than as a logo on a background. `twitter: { card:
"summary_large_image" }` in the root metadata reuses it; no second image file.

The image uses `ImageResponse`'s default font rather than fetching and
embedding Geist. Loading a font file into the OG renderer is real complexity for
a card most people see at thumbnail size.

### Icons and dead files

`src/app/favicon.ico` is still create-next-app's. It is replaced with an icon
derived from `src/components/invoicepilot/logo.tsx`, plus an `apple-icon`.
`public/next.svg`, `vercel.svg`, `window.svg`, `file.svg` and `globe.svg` are
deleted — none is referenced.

### README as case study

The README is the first artifact a reader opens, and it is currently
create-next-app's default text. It is replaced with:

- One sentence on what the project is, a live demo link, and a repository link
- Three screenshots: dashboard, invoices, collections board
- **What is real and what is fixtures** — auth, sessions, refresh rotation and
  the daily reseed run against Postgres; application screens read a
  deterministic ledger. Stating this plainly reads as judgment; being caught not
  stating it reads as the opposite
- Architecture: Next on Vercel → Express on Render → Postgres on Neon, why each
  free tier was chosen, and what each costs — the 21.8-second cold start, the
  daily demo reset
- Decisions worth defending: the token-only design system, the server-only data
  access layer in `src/lib/api/`, refresh rotation confined to `src/proxy.ts`,
  and the deterministic seed whose invariants are asserted in
  `src/lib/data/verify.ts`
- Local setup, the test commands, and what CI runs

Screenshot capture is a manual step for the author, into `docs/screenshots/`,
once the demo route works. The README text is written as part of this work and
references those paths.

The README opener and the demo CTA copy are drafted with
`marketing-skills:copywriting`; the metadata changes are verified afterwards
with `marketing-skills:seo-audit`.

---

## 4. Error handling, configuration, verification

### Failure paths

Three ways demo entry can fail, each with a defined response, none of them a
stack trace:

| Failure | Response |
|---|---|
| Render wake exceeds the wait | `/demo` shows "The demo server is taking longer than usual", a retry button, and a link to `/signup` |
| `DEMO_EMAIL` / `DEMO_PASSWORD` unset | `/demo` reports the demo is unavailable and points at signup. The CTA still renders; it degrades rather than 500s |
| Backend returns 401 | Same page, same message — a reseed between sessions must not produce an error boundary |

`/api/warm` returns 204 on every path, including failure.

### Configuration

Two new environment variables, `DEMO_EMAIL` and `DEMO_PASSWORD`, documented in
`.env.example` and set in the Vercel project. `NEXT_PUBLIC_SITE_URL` is
optional; `VERCEL_PROJECT_PRODUCTION_URL` covers production. The backend needs
no changes.

### Verification

No test framework is added. CI already runs `npx tsc --noEmit` and
`npm run build`, and both must stay green.

The one piece of non-trivial logic — the pure invoice mutation from §2 — gets a
single test file, `src/lib/data/mutate.test.ts`, using Node's built-in test
runner and `node:assert`. It asserts that applying a full payment zeroes the
balance, sets the status to paid and clears risk, and that a partial payment
reduces the balance without changing the status.

Running a TypeScript file under `node --test` relies on unflagged type
stripping, which needs Node 22.18 or newer. To remove the ambiguity: a `test`
script is added to the root `package.json` as
`node --test "src/lib/data/**/*.test.ts"`, the frontend CI job in
`.github/workflows/ci.yml` is pinned to `node-version: 24`, and a `npm test`
step is added to it after `npm run build`. The backend job keeps its own Node
22 pin — the two jobs are independent.

The rest is a manual pass against the deployed URL, enumerated as steps in the
implementation plan:

1. Cold demo entry from a private window with the backend asleep, timed
2. Warm demo entry, timed
3. Mark paid, record payment and send reminder — confirm the figures move on
   both the list and the detail screen
4. The OG card rendered by a real link preview
5. The demo route and the dashboard at phone width
6. Lighthouse on the landing page

---

## File change map

**New**

- `src/lib/actions/demo.ts`
- `src/app/demo/page.tsx`
- `src/app/api/warm/route.ts`
- `src/app/opengraph-image.tsx`
- `src/app/robots.ts`
- `src/app/icon.svg`, `src/app/apple-icon.png`
- Invoice-detail client wrapper under `src/components/invoices/`
- `src/lib/data/mutate.test.ts`

**Changed**

- `src/lib/marketing.ts` — URL resolution
- `src/app/layout.tsx` — `metadataBase`, twitter card
- `src/proxy.ts` — `/demo` handling
- `src/components/marketing/sections.tsx` — hero CTAs, warm-up trigger
- `src/components/marketing/site-chrome.tsx` — header and footer links
- `src/components/auth/auth-form.tsx` — demo link on login
- `src/components/invoices/invoices-table.tsx` — row state and mutations
- `src/components/invoicepilot/record-payment-dialog.tsx`,
  `send-reminder-dialog.tsx` — `onDone`
- `src/components/invoicepilot/demo-banner.tsx` — wording
- `src/components/invoices/new-invoice-form.tsx` — `ponytail:` comment
- `src/lib/data/` — the pure mutation
- `package.json` — `test` script
- `.github/workflows/ci.yml` — frontend job Node pin and `npm test` step
- `.env.example`, `README.md`

**Deleted**

- `public/next.svg`, `vercel.svg`, `window.svg`, `file.svg`, `globe.svg`
- `public/robots.txt` (replaced by `src/app/robots.ts`)
- `src/app/favicon.ico` (replaced)

## Manual steps for the author

1. Provide `DEMO_EMAIL` and `DEMO_PASSWORD`, or re-run the backend seeder to
   set them, and add both to the Vercel project
2. Create the UptimeRobot monitor on the Render `/health` endpoint
3. Capture three screenshots into `docs/screenshots/`
