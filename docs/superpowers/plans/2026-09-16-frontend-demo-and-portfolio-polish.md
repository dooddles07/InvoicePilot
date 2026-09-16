# Frontend Demo Access and Portfolio Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an anonymous visitor reach the InvoicePilot dashboard in one click, make in-app actions visibly change the screen, and package the repository and the shared link as finished portfolio work.

**Architecture:** A new server action signs a visitor into the seeded demo account and a `/demo` route explains the Render free-tier cold start while it happens. Table and detail-page actions mutate a local copy of their own data through one pure function, so the same function becomes the optimistic update when backend writes land. Metadata, icons, the OG image and the README are rewritten to point at the real deployment.

**Tech Stack:** Next.js 16.3.4 (App Router, React 19.2.8), TypeScript 5, Tailwind CSS 4, Base UI + shadcn primitives, TanStack Table 9, Zod 4, `next/og`, Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-16-frontend-demo-and-portfolio-polish-design.md`

## Global Constraints

- **Frontend only.** No file under `backend/` changes in this plan.
- **No new npm dependencies.** Everything needed is installed or built into Next.
- **Design tokens only.** No hardcoded hex values in components; use the semantic tokens listed in `design-system/invoicepilot/MASTER.md`.
- **Money is integer cents** in every type and prop. Formatting happens only through `src/lib/format.ts`.
- **`LinkButton` is the only way to render a button that navigates** (`src/components/invoicepilot/link-button.tsx`).
- **Status is never colour alone** — a colour always pairs with an icon and a word.
- **`npx tsc --noEmit` and `npm run build` must stay green** after every task.
- **Node 22.18+** is required for unflagged TypeScript type stripping under `node --test`. The frontend CI job is pinned to `node-version: 24` in Task 3.
- **Commits:** Conventional Commits, one commit per task, authored as `Brix Dodd <brixdodd07@gmail.com>`. No `Co-Authored-By` trailer and no mention of AI assistance anywhere in the message.
- **Every `@/...` import inside `src/lib/data/mutate.ts` must be `import type`.** Node's test runner does not resolve the `@/*` path alias; type-only imports are erased before execution, runtime imports are not.

---

### Task 1: One-click demo entry

**Files:**
- Create: `src/lib/actions/demo.ts`
- Create: `src/app/demo/page.tsx`
- Create: `src/components/demo/demo-entry.tsx`
- Modify: `src/lib/api/session.ts` (add the shared auth response schema)
- Modify: `src/lib/actions/auth.ts:26-32` (import that schema instead of redeclaring it)
- Modify: `src/proxy.ts:36` (add `/demo` to `SIGNED_OUT_ONLY`)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `apiFetch` and `ApiError` from `src/lib/api/client.ts`; `setSessionCookies` from `src/lib/auth/cookies.ts`; `ActionResult` from `src/lib/actions/auth.ts`.
- Produces: `enterDemo(): Promise<ActionResult>` from `src/lib/actions/demo.ts`; `authResponseSchema` exported from `src/lib/api/session.ts`; the route `/demo`.

- [ ] **Step 1: Move the auth response schema somewhere both actions can import it**

A `"use server"` module may only export async functions, so `demo.ts` cannot import the schema from `auth.ts`. Move it to the plain module that already owns `sessionUserSchema`.

Append to `src/lib/api/session.ts`:

```ts
/** The shape every token-issuing endpoint returns: login, signup, refresh,
 *  switch-workspace and the demo entry all answer with this. */
export const authResponseSchema = z.object({
  tokens: z.object({
    access_token: z.string(),
    refresh_token: z.string(),
    expires_in: z.number(),
  }),
  user: sessionUserSchema,
});
```

- [ ] **Step 2: Point `auth.ts` at the moved schema**

In `src/lib/actions/auth.ts`, delete the local `const authResponseSchema = z.object({...})` block (lines 26-32) and change the session import to:

```ts
import { authResponseSchema } from "@/lib/api/session";
```

`sessionUserSchema` was imported only to build that block, so it leaves the import list with it.

- [ ] **Step 3: Verify nothing broke**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Write the demo entry action**

Create `src/lib/actions/demo.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { ApiError, apiFetch } from "@/lib/api/client";
import { authResponseSchema } from "@/lib/api/session";
import { setSessionCookies } from "@/lib/auth/cookies";
import type { ActionResult } from "@/lib/actions/auth";

/**
 * Signs a visitor into the shared demo workspace.
 *
 * This is an ordinary login the visitor does not have to type — no new
 * authentication surface, no second code path. The credentials belong to the
 * account `npm run seed` created in backend/, and they never reach a browser:
 * this runs on the server and only the resulting cookies are sent back.
 *
 * Returns a result instead of throwing, for the same reason the login action
 * does: a thrown error replaces the page with the error boundary, which is the
 * wrong answer to "the demo server is still waking up".
 */
export async function enterDemo(): Promise<ActionResult> {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;

  if (!email || !password) {
    return {
      ok: false,
      message:
        "The demo is unavailable right now. You can create a workspace instead — it takes about a minute.",
    };
  }

  try {
    const result = await apiFetch("/auth/login", {
      method: "POST",
      body: { email, password },
      schema: authResponseSchema,
      token: null,
    });
    await setSessionCookies(result.tokens);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    // A reseed between sessions can invalidate the account mid-flight. That is
    // a "try again", not a broken deployment.
    if (error instanceof ApiError && error.status === 401) {
      return {
        ok: false,
        message: "The demo workspace is being rebuilt. Try again in a moment.",
      };
    }
    return {
      ok: false,
      message: "The demo server is taking longer than usual to wake up.",
    };
  }
}
```

- [ ] **Step 5: Write the client entry screen**

Create `src/components/demo/demo-entry.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { LinkButton } from "@/components/invoicepilot/link-button";
import { LogoMark } from "@/components/invoicepilot/logo";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { enterDemo } from "@/lib/actions/demo";

/** Measured cold start of the Render free instance, rounded up. */
const EXPECTED_SECONDS = 25;

export function DemoEntry() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(false);

  const run = useCallback(async () => {
    setError(null);
    setElapsed(0);
    const result = await enterDemo();
    if (result.ok) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    setError(result.message);
  }, [router]);

  useEffect(() => {
    // Strict Mode invokes effects twice in development; a second login attempt
    // would rotate the tokens the first one just set.
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  useEffect(() => {
    if (error) return;
    const id = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [error]);

  const pct = Math.min(95, (elapsed / EXPECTED_SECONDS) * 100);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="bg-card shadow-e1 rounded-xl border p-6">
        <LogoMark className="size-8" />

        {error ? (
          <>
            <h1 className="mt-4 text-h2 font-semibold tracking-tight text-balance">
              The demo did not open
            </h1>
            <p className="text-muted-foreground mt-2 flex items-start gap-2 text-small">
              <AlertTriangle className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  void run();
                }}
              >
                Try again
              </Button>
              <LinkButton size="sm" variant="outline" href="/signup">
                Create a workspace
              </LinkButton>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-h2 font-semibold tracking-tight text-balance">
              Opening the demo workspace
            </h1>
            <p className="text-muted-foreground mt-2 text-small">
              The API sleeps after fifteen minutes idle on its free tier, so the
              first request of the day wakes it. About {EXPECTED_SECONDS} seconds.
            </p>
            <Progress value={pct} className="mt-5" aria-label="Waking the demo server" />
            <p className="text-muted-foreground tnum mt-2 text-caption">
              {elapsed}s elapsed
            </p>
          </>
        )}
      </div>

      <p className="text-muted-foreground mt-4 text-center text-caption">
        The demo workspace is shared with every visitor and resets daily at
        04:00 UTC.
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Write the route that carries the function timeout**

`maxDuration` cannot be exported from a `"use client"` module, and the default function timeout on Vercel Hobby is shorter than the measured 21.8-second cold start. The route is a Server Component that sets the ceiling and renders the client screen.

Create `src/app/demo/page.tsx`:

```tsx
import type { Metadata } from "next";

import { DemoEntry } from "@/components/demo/demo-entry";

// The login inside enterDemo() waits on a sleeping Render instance. Vercel's
// hobby ceiling is 60 seconds, and the default is well under the measured
// 21.8-second cold start.
export const maxDuration = 60;

export const metadata: Metadata = {
  title: { absolute: "Opening the demo — InvoicePilot" },
  // Nothing here is content; it is a door.
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return <DemoEntry />;
}
```

- [ ] **Step 7: Let a signed-in visitor skip the door**

In `src/proxy.ts`, add `/demo` to `SIGNED_OUT_ONLY` (line 36):

```ts
const SIGNED_OUT_ONLY = ["/login", "/signup", "/forgot-password", "/demo"];
```

Someone who already has a session is redirected to `/dashboard` instead of logging in a second time.

- [ ] **Step 8: Document the new environment variables**

Append to `.env.example`:

```
# The demo account created by `npm run seed -- --email … --password …` in
# backend/. The /demo route signs visitors in with these; they never reach a
# browser. Leave them unset locally and /demo will say the demo is unavailable
# rather than fail.
DEMO_EMAIL=""
DEMO_PASSWORD=""
```

- [ ] **Step 9: Verify locally**

Set `DEMO_EMAIL` and `DEMO_PASSWORD` in `.env.local`, start the backend (`npm start` in `backend/`), then run `npm run dev` and visit `http://localhost:3000/demo`.

Expected: the waking screen appears, then the dashboard loads with the demo banner visible. Visiting `/demo` again while signed in redirects straight to `/dashboard`.

Then unset `DEMO_EMAIL`, restart, and visit `/demo` again.
Expected: "The demo is unavailable right now", a working "Create a workspace" button, and no error boundary.

- [ ] **Step 10: Verify the build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed; `/demo` appears in the route list.

- [ ] **Step 11: Commit**

```bash
git add src/lib/actions/demo.ts src/app/demo src/components/demo src/lib/api/session.ts src/lib/actions/auth.ts src/proxy.ts .env.example
git commit -m "feat: open the demo workspace in one click"
```

---

### Task 2: Warm the API before the click, and point every CTA at the demo

**Files:**
- Create: `src/app/api/warm/route.ts`
- Create: `src/components/marketing/warm-demo.tsx`
- Modify: `src/app/(marketing)/layout.tsx`
- Modify: `src/components/marketing/sections.tsx:50-58` (hero CTAs)
- Modify: `src/components/marketing/site-chrome.tsx:57-60` (header CTA) and `:120` (footer link)
- Modify: `src/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: the `/demo` route from Task 1.
- Produces: `GET /api/warm` returning 204; `<WarmDemo />` from `src/components/marketing/warm-demo.tsx`.

- [ ] **Step 1: Write the warm-up route**

Create `src/app/api/warm/route.ts`:

```ts
/**
 * Wakes the Render instance while the visitor is still reading.
 *
 * Render suspends a free service after fifteen minutes idle, and waking it
 * measured 21.8 seconds. A visitor who spends that long on the landing page
 * before clicking "View live demo" pays none of it.
 *
 * Answers 204 on every path, including failure: a warm-up that did not work
 * is not the visitor's problem and must never surface on the page.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = process.env.API_BASE_URL;
  if (!baseUrl) return new Response(null, { status: 204 });

  try {
    await fetch(`${baseUrl}/health`, { cache: "no-store" });
  } catch {
    // Deliberately silent.
  }

  return new Response(null, { status: 204 });
}
```

- [ ] **Step 2: Write the trigger**

Create `src/components/marketing/warm-demo.tsx`:

```tsx
"use client";

import { useEffect } from "react";

/** Renders nothing. Fires one request so the API is awake by the time a
 *  visitor finishes reading the page. */
export function WarmDemo() {
  useEffect(() => {
    void fetch("/api/warm", { cache: "no-store" }).catch(() => {});
  }, []);

  return null;
}
```

- [ ] **Step 3: Mount it on every marketing page**

In `src/app/(marketing)/layout.tsx`, import `WarmDemo` and render `<WarmDemo />` as the first child of the layout's returned fragment. Mounting it in the layout rather than the hero covers the visitor who lands on `/pricing` or `/faq` first.

- [ ] **Step 4: Make the demo the hero's primary action**

In `src/components/marketing/sections.tsx`, replace the two `LinkButton`s in `Hero` (lines 50-58) with:

```tsx
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton size="lg" href="/demo">
              View live demo
              <ArrowRight className="size-4" />
            </LinkButton>
            <LinkButton size="lg" variant="outline" href="/signup">
              Start free
            </LinkButton>
          </div>
```

Then change the trust line below it so it describes the demo rather than the trial: replace the three items with `No signup` / `Live data` / `Resets daily`, keeping the existing `CheckCircle2` markup for each.

- [ ] **Step 5: Make the header CTA the demo**

In `src/components/marketing/site-chrome.tsx`, replace the `Start free` `LinkButton` (lines 57-60) with:

```tsx
          {/* The primary CTA lives in the nav as well as after the metrics — a
              visitor who is already convinced should not have to scroll. The
              demo outranks signup here: it is the lower-friction action and it
              is the one that shows the product. */}
          <LinkButton size="sm" href="/demo">
            View live demo
          </LinkButton>
```

- [ ] **Step 6: Fix the footer link that redirects to login**

In the same file, line 120, change `{ href: "/dashboard", label: "Live demo" }` to `{ href: "/demo", label: "Live demo" }`.

- [ ] **Step 7: Give the login page a way in**

In `src/app/(auth)/login/page.tsx`, add a third paragraph inside the existing `text-caption` block, after the "New here?" paragraph:

```tsx
        <p>
          Just looking?{" "}
          <Link href="/demo" className="text-brand hover:underline">
            Open the demo workspace
          </Link>
        </p>
```

- [ ] **Step 8: Verify**

Run `npm run dev`, load `/`, and confirm in the browser network panel that `/api/warm` is requested once and answers 204. Click "View live demo" in the hero, the header and the footer; each lands on `/demo`.

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/warm src/components/marketing "src/app/(marketing)/layout.tsx" "src/app/(auth)/login/page.tsx"
git commit -m "feat: lead with the demo and wake the API before the click"
```

---

### Task 3: The pure invoice mutation, its test, and a test runner

**Files:**
- Create: `src/lib/data/mutate.ts`
- Create: `src/lib/data/mutate.test.ts`
- Modify: `package.json` (add the `test` script)
- Modify: `.github/workflows/ci.yml:38-49` (frontend job)

**Interfaces:**
- Consumes: the `Invoice` and `ISODate` types from `src/types/index.ts`.
- Produces: `applyPayment(invoice: Invoice, amountCents: number, receivedOn: ISODate): Invoice`, `markPaid(invoice: Invoice, on: ISODate): Invoice`, and `markReminded(invoice: Invoice, on: ISODate): Invoice`, all exported from `src/lib/data/mutate.ts`. Tasks 4 and 5 both import them.

- [ ] **Step 1: Write the failing test**

Create `src/lib/data/mutate.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { applyPayment, markPaid, markReminded } from "./mutate.ts";

/** A minimal open invoice. Fields the mutation does not read are filled with
 *  values that make an accidental read obvious. */
const base = {
  id: "inv-1",
  workspace_id: "ws-1",
  number: "INV-1001",
  customer_id: "cus-1",
  customer_name: "Northwind Studio",
  status: "overdue" as const,
  risk: "high" as const,
  amount_cents: 120_000,
  paid_cents: 0,
  balance_cents: 120_000,
  issue_date: "2026-08-01",
  due_date: "2026-08-31",
  paid_date: null,
  days_overdue: 16,
  last_contacted_at: null,
  next_action: "Send a firm reminder",
  po_number: null,
  notes: null,
  items: [],
};

test("a full payment settles the invoice", () => {
  const result = applyPayment(base, 120_000, "2026-09-16");

  assert.equal(result.balance_cents, 0);
  assert.equal(result.paid_cents, 120_000);
  assert.equal(result.status, "paid");
  assert.equal(result.risk, "low");
  assert.equal(result.days_overdue, 0);
  assert.equal(result.paid_date, "2026-09-16");
});

test("a partial payment reduces the balance without settling", () => {
  const result = applyPayment(base, 45_000, "2026-09-16");

  assert.equal(result.balance_cents, 75_000);
  assert.equal(result.paid_cents, 45_000);
  assert.equal(result.status, "partially_paid");
  assert.equal(result.risk, "high");
  assert.equal(result.days_overdue, 16);
  assert.equal(result.paid_date, null);
});

test("an overpayment never drives the balance below zero", () => {
  const result = applyPayment(base, 500_000, "2026-09-16");

  assert.equal(result.balance_cents, 0);
  assert.equal(result.paid_cents, 120_000);
  assert.equal(result.status, "paid");
});

test("a second partial payment settles the remainder", () => {
  const once = applyPayment(base, 45_000, "2026-09-16");
  const twice = applyPayment(once, 75_000, "2026-09-17");

  assert.equal(twice.balance_cents, 0);
  assert.equal(twice.status, "paid");
  assert.equal(twice.paid_date, "2026-09-17");
});

test("marking paid settles whatever is outstanding", () => {
  const partial = applyPayment(base, 20_000, "2026-09-16");
  const result = markPaid(partial, "2026-09-16");

  assert.equal(result.balance_cents, 0);
  assert.equal(result.status, "paid");
});

test("the input invoice is never mutated", () => {
  applyPayment(base, 120_000, "2026-09-16");

  assert.equal(base.balance_cents, 120_000);
  assert.equal(base.status, "overdue");
});

test("a reminder stamps the contact date and nothing else", () => {
  const result = markReminded(base, "2026-09-16");

  assert.equal(result.last_contacted_at, "2026-09-16");
  assert.equal(result.status, "overdue");
  assert.equal(result.balance_cents, 120_000);
});
```

- [ ] **Step 2: Add the test script**

In `package.json`, add to `scripts`:

```json
    "test": "node --test \"src/lib/data/**/*.test.ts\""
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './mutate.ts'`.

- [ ] **Step 4: Write the mutation**

Create `src/lib/data/mutate.ts`:

```ts
import type { Invoice, ISODate } from "@/types";

/**
 * What a payment does to an invoice.
 *
 * Pure, and deliberately not a method on anything: the tables and the invoice
 * detail page both apply it to their own local copy today, and it is the same
 * transformation an optimistic update will apply once writes reach the API.
 *
 * Money is integer cents, so every figure here is exact.
 */
export function applyPayment(
  invoice: Invoice,
  amountCents: number,
  receivedOn: ISODate,
): Invoice {
  const paid = Math.min(invoice.amount_cents, invoice.paid_cents + amountCents);
  const balance = invoice.amount_cents - paid;
  const settled = balance === 0;

  return {
    ...invoice,
    paid_cents: paid,
    balance_cents: balance,
    status: settled ? "paid" : "partially_paid",
    // A settled invoice carries no collection risk and is no longer late.
    risk: settled ? "low" : invoice.risk,
    days_overdue: settled ? 0 : invoice.days_overdue,
    paid_date: settled ? receivedOn : invoice.paid_date,
  };
}

/** Settle the whole outstanding balance. */
export function markPaid(invoice: Invoice, on: ISODate): Invoice {
  return applyPayment(invoice, invoice.balance_cents, on);
}

/** Record that someone was chased today. */
export function markReminded(invoice: Invoice, on: ISODate): Invoice {
  return { ...invoice, last_contacted_at: on };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 7 tests.

If Node reports `Cannot find package '@/types'`, the type import lost its `import type` prefix. Type-only imports are erased before execution; value imports are not, and Node does not resolve the `@/*` alias.

- [ ] **Step 6: Run the tests in CI**

In `.github/workflows/ci.yml`, in the `frontend` job only, change `node-version: 22` to `node-version: 24` and add a step after `npm run build`:

```yaml
      - run: npm test
```

Node 24 is pinned because running a TypeScript file under `node --test` needs unflagged type stripping (Node 22.18+). The `backend` job keeps its own Node 22 pin; the two jobs are independent.

- [ ] **Step 7: Verify the whole suite**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all three succeed.

- [ ] **Step 8: Commit**

```bash
git add src/lib/data/mutate.ts src/lib/data/mutate.test.ts package.json .github/workflows/ci.yml
git commit -m "feat: derive an invoice's new state from a payment"
```

---

### Task 4: Make the invoices table respond to its own actions

**Files:**
- Modify: `src/components/invoices/invoices-table.tsx` (state at :109-127, row menu at :311-320, bulk bar at :478-505)

**Interfaces:**
- Consumes: `applyPayment`, `markPaid`, `markReminded` from `src/lib/data/mutate.ts` (Task 3).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Hold the rows in state**

In `src/components/invoices/invoices-table.tsx`, add the import:

```tsx
import { markPaid, markReminded } from "@/lib/data/mutate";
```

Then, immediately after the `const [age, setAge] = useState<AgeFilter>("open");` line, add:

```tsx
  // A local copy so an action changes what is on screen. The write itself is
  // not real yet — see the demo banner — but the row must not sit there
  // unchanged after the person acted on it, or every screen reads as a
  // screenshot.
  const [rows, setRows] = useState(invoices);

  const patch = (ids: string[], fn: (invoice: Invoice) => Invoice) =>
    setRows((current) =>
      current.map((invoice) => (ids.includes(invoice.id) ? fn(invoice) : invoice)),
    );
```

- [ ] **Step 2: Derive from the local copy**

In the `data` `useMemo` immediately below, replace all four references to `invoices` with `rows`, and change the dependency array from `[invoices, age]` to `[rows, age]`.

- [ ] **Step 3: Add "Mark as paid" to the row menu**

In the row `DropdownMenuContent`, insert a new item directly above the existing "Send reminder" item:

```tsx
                <DropdownMenuItem
                  onClick={() => {
                    patch([row.original.id], (invoice) => markPaid(invoice, today));
                    toast.success(`${row.original.number} marked as paid`, {
                      description: `${money(row.original.balance_cents)} settled for ${row.original.customer_name}.`,
                    });
                  }}
                >
                  <Check className="size-4" />
                  Mark as paid
                </DropdownMenuItem>
```

`Check` and `money` are already imported in this file.

- [ ] **Step 4: Make the row-level reminder stamp the row**

Replace the `onClick` on the existing "Send reminder" item with:

```tsx
                  onClick={() => {
                    patch([row.original.id], (invoice) => markReminded(invoice, today));
                    toast.success("Reminder queued", {
                      description: `A reminder for ${row.original.number} will go to ${row.original.customer_name}.`,
                    });
                  }}
```

- [ ] **Step 5: Make the bulk actions move every selected row**

In the `BulkBar`, replace the two `onClick` handlers with:

```tsx
          onClick={() => {
            patch(
              selected.map((r) => r.original.id),
              (invoice) => markReminded(invoice, today),
            );
            table.resetRowSelection();
            toast.success("Reminders queued", {
              description: `${selected.length} reminders will be sent from your address.`,
            });
          }}
```

and

```tsx
          onClick={() => {
            // Read the figure before the rows change: `selectedValue` is
            // derived from the rows this click is about to settle.
            const settled = money(selectedValue);
            const count = selected.length;
            patch(
              selected.map((r) => r.original.id),
              (invoice) => markPaid(invoice, today),
            );
            table.resetRowSelection();
            toast.success("Marked as paid", {
              description: `${count} invoices settled for ${settled}.`,
            });
          }}
```

Apply the same `const count = selected.length;` capture to the reminders handler above, for the same reason.

- [ ] **Step 6: Verify by hand**

Run `npm run dev` and open `/invoices` (via `/demo` if you are signed out).

Expected, with the age filter on "open": marking a row paid removes it from the list and the header count drops by one. Switching the filter to "all" shows it with a paid badge, a zero balance and no risk badge. Selecting three rows and using the bulk "Mark paid" does the same three times and clears the selection.

- [ ] **Step 7: Verify the build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 8: Commit**

```bash
git add src/components/invoices/invoices-table.tsx
git commit -m "feat: settle and chase invoices from the table itself"
```

---

### Task 5: Make the invoice detail page respond to its own actions

**Files:**
- Create: `src/components/invoices/invoice-live.tsx`
- Modify: `src/app/(app)/invoices/[id]/page.tsx` (header figure and status badge region, the `InvoiceActions` mount, and the timeline card)
- Modify: `src/components/invoicepilot/record-payment-dialog.tsx:83-95`
- Modify: `src/components/invoicepilot/send-reminder-dialog.tsx:145-152`
- Modify: `src/components/invoices/invoice-actions.tsx:22-48`

**Interfaces:**
- Consumes: `applyPayment`, `markReminded` from `src/lib/data/mutate.ts`; the `Invoice` and `CollectionEvent` types.
- Produces: `InvoiceLiveProvider`, `useInvoiceLive`, `InvoiceLiveFigure`, `InvoiceLiveStatus` and `InvoiceLiveTimeline` from `src/components/invoices/invoice-live.tsx`. `RecordPaymentDialog` gains `onRecorded?: (amountCents: number, receivedOn: string) => void`; `SendReminderDialog` gains `onSent?: () => void`; `InvoiceActions` gains `onRecorded` and `onSent` and passes them through.

- [ ] **Step 1: Give the dialogs a way to report what happened**

In `src/components/invoicepilot/record-payment-dialog.tsx`, add `onRecorded` to the props:

```tsx
  onRecorded,
}: {
  invoice: Invoice;
  /** Passed in so the default date matches the demo ledger, not the wall clock. */
  today: string;
  trigger?: ReactElement;
  /** Told what was recorded, so the caller can move its own figures. */
  onRecorded?: (amountCents: number, receivedOn: string) => void;
}) {
```

and call it inside `onSubmit`, directly after `form.reset()`:

```tsx
    onRecorded?.(cents, values.received_on);
```

- [ ] **Step 2: Do the same for the reminder dialog**

In `src/components/invoicepilot/send-reminder-dialog.tsx`, add `onSent?: () => void` to the props and call `onSent?.();` immediately before the existing `toast.success("Reminder sent", …)`.

- [ ] **Step 3: Pass both through the action row**

In `src/components/invoices/invoice-actions.tsx`, add `onRecorded` and `onSent` to the props with the same types, then forward them:

```tsx
          <SendReminderDialog
            invoice={invoice}
            contactName={contactName}
            recommendedTone={tone}
            onSent={onSent}
          />
          <RecordPaymentDialog invoice={invoice} today={today} onRecorded={onRecorded} />
```

- [ ] **Step 4: Verify nothing broke**

Run: `npx tsc --noEmit`
Expected: no errors. Existing call sites pass neither prop and keep their current behaviour.

- [ ] **Step 5: Write the live island**

The detail page shows the same invoice in three places — the header figure, the status badge and the activity timeline — and they sit in different cards. One provider owns the state; three small consumers read it. The page stays a Server Component and passes the server-rendered invoice in as the initial value.

Create `src/components/invoices/invoice-live.tsx`:

```tsx
"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { InvoiceStatusBadge } from "@/components/invoicepilot/status-badge";
import { Timeline } from "@/components/invoicepilot/timeline";
import { applyPayment, markReminded } from "@/lib/data/mutate";
import { formatDate, money } from "@/lib/format";
import type { CollectionEvent, Invoice } from "@/types";

type LiveState = {
  invoice: Invoice;
  events: CollectionEvent[];
  record: (amountCents: number, receivedOn: string) => void;
  remind: () => void;
};

const InvoiceLiveContext = createContext<LiveState | null>(null);

function useLive(): LiveState {
  const value = useContext(InvoiceLiveContext);
  if (!value) {
    throw new Error("Invoice live components must sit inside InvoiceLiveProvider.");
  }
  return value;
}

/** Exported for the header card, which needs the customer name for its copy. */
export function useInvoiceLive(): Invoice {
  return useLive().invoice;
}

export function InvoiceLiveProvider({
  invoice,
  events,
  today,
  children,
}: {
  invoice: Invoice;
  events: CollectionEvent[];
  today: string;
  children: ReactNode;
}) {
  const [current, setCurrent] = useState(invoice);
  const [log, setLog] = useState(events);

  const value = useMemo<LiveState>(
    () => ({
      invoice: current,
      events: log,
      record: (amountCents, receivedOn) => {
        setCurrent((inv) => applyPayment(inv, amountCents, receivedOn));
        setLog((entries) => [
          {
            id: `local-payment-${entries.length}`,
            workspace_id: current.workspace_id,
            invoice_id: current.id,
            customer_id: current.customer_id,
            type: "payment_received",
            channel: "system",
            summary: `Payment of ${money(amountCents)} recorded`,
            detail: `Received ${formatDate(receivedOn)}.`,
            actor: "You",
            occurred_at: receivedOn,
          },
          ...entries,
        ]);
      },
      remind: () => {
        setCurrent((inv) => markReminded(inv, today));
        setLog((entries) => [
          {
            id: `local-reminder-${entries.length}`,
            workspace_id: current.workspace_id,
            invoice_id: current.id,
            customer_id: current.customer_id,
            type: "reminder_sent",
            channel: "email",
            summary: `Reminder sent to ${current.customer_name}`,
            detail: null,
            actor: "You",
            occurred_at: today,
          },
          ...entries,
        ]);
      },
    }),
    [current, log, today],
  );

  return (
    <InvoiceLiveContext.Provider value={value}>
      {children}
    </InvoiceLiveContext.Provider>
  );
}

/** The headline amount and the line underneath it. */
export function InvoiceLiveFigure() {
  const invoice = useLive().invoice;

  return (
    <div className="shrink-0 lg:text-right">
      <p className="figure text-h1 leading-none font-semibold">
        {money(
          invoice.status === "paid" ? invoice.amount_cents : invoice.balance_cents,
        )}
      </p>
      <p className="text-muted-foreground mt-1 text-caption">
        {invoice.status === "paid"
          ? "paid in full"
          : invoice.paid_cents > 0
            ? `${money(invoice.paid_cents)} of ${money(invoice.amount_cents)} received`
            : `due ${formatDate(invoice.due_date)}`}
      </p>
    </div>
  );
}

export function InvoiceLiveStatus() {
  return <InvoiceStatusBadge status={useLive().invoice.status} />;
}

export function InvoiceLiveActions({ contactName, today }: {
  contactName: string;
  today: string;
}) {
  const { invoice, record, remind } = useLive();

  return (
    <InvoiceActions
      invoice={invoice}
      contactName={contactName}
      today={today}
      onRecorded={record}
      onSent={remind}
    />
  );
}

export function InvoiceLiveTimeline({ emptyLabel }: { emptyLabel?: string }) {
  return <Timeline events={useLive().events} emptyLabel={emptyLabel} />;
}
```

`InvoiceStatusBadge` takes `status: InvoiceStatus` (`src/components/invoicepilot/status-badge.tsx:90-96`), which is what `InvoiceLiveStatus` passes.

- [ ] **Step 6: Wire the detail page to the island**

In `src/app/(app)/invoices/[id]/page.tsx`:

1. Import the island: `import { InvoiceLiveActions, InvoiceLiveFigure, InvoiceLiveProvider, InvoiceLiveStatus, InvoiceLiveTimeline } from "@/components/invoices/invoice-live";`
2. Wrap everything the page returns in `<InvoiceLiveProvider invoice={invoice} events={events} today={NOW.toISOString().slice(0, 10)}>…</InvoiceLiveProvider>`.
3. Replace the header's `<div className="shrink-0 lg:text-right">…</div>` block with `<InvoiceLiveFigure />`.
4. Replace the header's `<InvoiceStatusBadge status={invoice.status} />` with `<InvoiceLiveStatus />`.
5. Replace `<InvoiceActions invoice={invoice} contactName={customer.contact_name} today={NOW.toISOString().slice(0, 10)} />` with `<InvoiceLiveActions contactName={customer.contact_name} today={NOW.toISOString().slice(0, 10)} />`.
6. Replace the `<Timeline events={events} … />` mount in the activity card with `<InvoiceLiveTimeline />`, keeping whatever `emptyLabel` the page passes today.

Leave the communications card, which filters `events` by type for its own purpose, reading the server list. It is history, not the thing the action changed.

- [ ] **Step 7: Verify by hand**

Run `npm run dev`, open any overdue invoice from `/invoices`.

Expected: recording a full payment closes the dialog, the headline figure drops to the amount with "paid in full" beneath it, the status badge turns to paid, the action row collapses to the settled set, and a "Payment of … recorded" entry appears at the top of the activity timeline. Sending a reminder adds a reminder entry. A partial payment leaves the invoice open with the balance reduced.

- [ ] **Step 8: Verify the build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all three succeed.

- [ ] **Step 9: Commit**

```bash
git add src/components/invoices/invoice-live.tsx "src/app/(app)/invoices/[id]/page.tsx" src/components/invoicepilot/record-payment-dialog.tsx src/components/invoicepilot/send-reminder-dialog.tsx src/components/invoices/invoice-actions.tsx
git commit -m "feat: move the figures on an invoice when you act on it"
```

---

### Task 6: Say what the demo actually is

**Files:**
- Modify: `src/components/invoicepilot/demo-banner.tsx:17-23`
- Modify: `src/components/invoices/new-invoice-form.tsx:95-102`

**Interfaces:** none.

- [ ] **Step 1: Correct the banner**

The banner currently claims "Everything you change here is real until then", which is false while the screens read fixtures. Replace the `<p>` in `src/components/invoicepilot/demo-banner.tsx` with:

```tsx
      <p>
        Demo workspace — shared with every visitor and rebuilt daily at 04:00
        UTC. Changes you make here live in this browser session; sign-in,
        sessions and the daily rebuild are real.
      </p>
```

- [ ] **Step 2: Record the known ceiling on invoice creation**

In `src/components/invoices/new-invoice-form.tsx`, add above the `toast.success("Invoice created", …)` call inside `onSubmit`:

```tsx
    // ponytail: the created invoice does not appear in the list — the ledger is
    // a module-level fixture and nothing survives the navigation. Closed by the
    // backend write path, not by a client-side store built to be deleted.
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/components/invoicepilot/demo-banner.tsx src/components/invoices/new-invoice-form.tsx
git commit -m "docs: state plainly which parts of the demo are real"
```

---

### Task 7: One real URL

**Files:**
- Modify: `src/lib/marketing.ts:11-17`
- Modify: `src/app/layout.tsx:10-18`
- Create: `src/app/robots.ts`
- Delete: `public/robots.txt`

**Interfaces:**
- Produces: `SITE.url` resolved from the environment; `metadataBase` on the root metadata. Task 8's OG image relies on `metadataBase` to resolve.

- [ ] **Step 1: Resolve the site URL from the environment**

In `src/lib/marketing.ts`, replace the hardcoded `url: "https://invoicepilot.com"` with a resolved constant declared above `SITE`:

```ts
/**
 * Where this deployment actually lives.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` is set by Vercel on every deployment and
 * names the production domain, so a preview build still writes canonicals that
 * point at production — which is what a canonical is for.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const SITE = {
  name: "InvoicePilot",
  tagline: "Get paid faster. Without chasing invoices.",
  description:
    "InvoicePilot automates accounts receivable, follows up with customers, and gives your team a clear view of cash flow.",
  url: siteUrl,
} as const;
```

- [ ] **Step 2: Give metadata an absolute base**

In `src/app/layout.tsx`, import `SITE` from `@/lib/marketing` and add `metadataBase` as the first key of the exported `metadata` object:

```ts
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
```

- [ ] **Step 3: Move robots out of `public/`**

`public/robots.txt` hardcodes the sitemap at a domain that is not this deployment. Delete it and create `src/app/robots.ts`, carrying over the rules the static file declared:

```ts
import type { MetadataRoute } from "next";

import { SITE } from "@/lib/marketing";

/**
 * Search and AI-answer crawlers are welcome. Blocking them would mean the
 * assistants buyers increasingly ask "what is the best AR tool and what does it
 * cost?" cannot cite us at all. Bulk training-corpus scraping is a different
 * trade, and that one returns nothing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /settings is a workspace's own configuration; /demo is a door rather
        // than a page, and /api answers nothing a crawler can use.
        disallow: ["/settings/", "/demo", "/api/"],
      },
      {
        userAgent: [
          "GPTBot",
          "ChatGPT-User",
          "PerplexityBot",
          "ClaudeBot",
          "anthropic-ai",
          "Google-Extended",
        ],
        allow: "/",
      },
      { userAgent: "CCBot", disallow: "/" },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
```

This is a faithful port of every rule the static file declared, plus `/demo`
and `/api/` on the wildcard group. Nothing else changes.

- [ ] **Step 4: Verify**

Run: `npm run build && npm run dev`, then load `http://localhost:3000/robots.txt` and `http://localhost:3000/sitemap.xml`.
Expected: robots lists the sitemap at `http://localhost:3000/sitemap.xml`, and every sitemap URL uses the same origin. No occurrence of `invoicepilot.com` in either.

- [ ] **Step 5: Commit**

```bash
git add src/lib/marketing.ts src/app/layout.tsx src/app/robots.ts public/robots.txt
git commit -m "fix: point canonicals and the sitemap at this deployment"
```

---

### Task 8: A social card that looks like the product

**Files:**
- Create: `src/app/opengraph-image.tsx`
- Modify: `src/app/layout.tsx` (add the twitter card key)

**Interfaces:**
- Consumes: `SITE` from `src/lib/marketing.ts` and `metadataBase` from Task 7.
- Produces: `/opengraph-image` at 1200×630, referenced automatically by Next in `og:image`.

- [ ] **Step 1: Draw the card**

`ImageResponse` ships with Next — no dependency is added. It supports a subset of CSS: flexbox only, no CSS variables, no Tailwind classes. The design-system colours are therefore written as literal values **in this file only**; every other file keeps using tokens.

Create `src/app/opengraph-image.tsx`:

```tsx
import { ImageResponse } from "next/og";

import { SITE } from "@/lib/marketing";

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The dark surface from globals.css, resolved to hex: ImageResponse cannot
 *  read CSS variables or oklch(). */
const INK = "#0B1120";
const CARD = "#141C2E";
const TEXT = "#F8FAFC";
const MUTED = "#94A3B8";
const BRAND = "#6366F1";
const SUCCESS = "#34D399";

const FIGURES = [
  { label: "Outstanding", value: "$412,800", tone: TEXT },
  { label: "Overdue", value: "$96,400", tone: "#FBBF24" },
  { label: "Collected this month", value: "$188,250", tone: SUCCESS },
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: INK,
          padding: 72,
          color: TEXT,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: BRAND,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            IP
          </div>
          <div style={{ fontSize: 34, fontWeight: 600 }}>{SITE.name}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05, maxWidth: 900 }}>
            {SITE.tagline}
          </div>
          <div style={{ fontSize: 30, color: MUTED, maxWidth: 820 }}>
            Accounts receivable automation — reminders, collections pipeline and
            cash-flow forecasting.
          </div>
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          {FIGURES.map((figure) => (
            <div
              key={figure.label}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                background: CARD,
                borderRadius: 18,
                padding: "22px 28px",
                minWidth: 300,
              }}
            >
              <div style={{ fontSize: 22, color: MUTED }}>{figure.label}</div>
              <div style={{ fontSize: 44, fontWeight: 700, color: figure.tone }}>
                {figure.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
```

The card uses `ImageResponse`'s default font rather than fetching and embedding Geist. Loading a font file into the renderer is real complexity for an image most people see at thumbnail size.

- [ ] **Step 2: Declare the Twitter card type**

In `src/app/layout.tsx`, add to the `metadata` object after `description`:

```ts
  twitter: { card: "summary_large_image" },
```

No second image file is needed: Next uses the same `opengraph-image` for `twitter:image`.

- [ ] **Step 3: Verify**

Run `npm run dev` and open `http://localhost:3000/opengraph-image`.
Expected: a 1200×630 PNG with the product name, the tagline and three KPI tiles, no clipped text and no missing-font boxes.

Then view the page source of `/` and confirm an `og:image` meta tag resolves to an absolute URL.

- [ ] **Step 4: Verify the build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add src/app/opengraph-image.tsx src/app/layout.tsx
git commit -m "feat: render a social card that shows the product"
```

---

### Task 9: Icons, and the create-next-app leftovers

**Files:**
- Create: `src/app/icon.svg`
- Create: `src/app/apple-icon.tsx`
- Delete: `src/app/favicon.ico`
- Delete: `public/next.svg`, `public/vercel.svg`, `public/window.svg`, `public/file.svg`, `public/globe.svg`

**Interfaces:** none.

- [ ] **Step 1: Confirm nothing references the files you are about to delete**

Run: `grep -rn "next.svg\|vercel.svg\|window.svg\|file.svg\|globe.svg" src public README.md`
Expected: no matches outside `public/` itself. If a match appears, fix that reference first.

- [ ] **Step 2: Write the app icon**

`src/app/favicon.ico` is still create-next-app's. Replace it with an SVG icon drawn from the same mark as `src/components/invoicepilot/logo.tsx`, with the token classes resolved to literal colours (a favicon has no stylesheet):

Create `src/app/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
  <rect x="0.5" y="0.5" width="23" height="23" rx="6.5" fill="#0F172A" stroke="#0F172A"/>
  <path d="M5.5 15.5 L10 11 L13 14 L18.5 7.5" fill="none" stroke="#FAFAF9" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M14.5 7.5 H18.5 V11.5" fill="none" stroke="#FAFAF9" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="10" cy="11" r="1.4" fill="#FAFAF9"/>
</svg>
```

- [ ] **Step 3: Write the touch icon**

iOS ignores SVG icons, so the home-screen icon is rendered rather than shipped
as a binary — same `ImageResponse` already used for the social card, no image
tooling and no committed PNG.

Create `src/app/apple-icon.tsx`:

```tsx
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0F172A",
          color: "#FAFAF9",
          fontSize: 96,
          fontWeight: 700,
        }}
      >
        IP
      </div>
    ),
    size,
  );
}
```

- [ ] **Step 4: Delete the leftovers**

```bash
git rm src/app/favicon.ico public/next.svg public/vercel.svg public/window.svg public/file.svg public/globe.svg
```

- [ ] **Step 5: Verify**

Run: `npm run build && npm run dev`, then hard-reload `http://localhost:3000` and check the browser tab. Also open `http://localhost:3000/apple-icon`.
Expected: the InvoicePilot mark in the tab, not the Next.js logo; a 180×180 PNG at `/apple-icon`. `/next.svg` now 404s, and no page is broken by it.

- [ ] **Step 6: Commit**

```bash
git add src/app/icon.svg src/app/apple-icon.tsx
git commit -m "feat: ship our own icons and drop the starter assets"
```

---

### Task 10: The README as a case study

**Files:**
- Modify: `README.md` (full replacement)
- Create: `docs/screenshots/` (directory, populated by the author — see the manual steps at the end of this plan)

**Interfaces:** none.

- [ ] **Step 1: Gather the facts the README states**

Before writing, confirm each of these from the repository rather than from memory:

- The live URLs (Vercel production domain, Render service URL)
- Route count: `npm run build` prints the route table
- Test counts: `npm test` in the root, and `npm test` in `backend/`
- What CI runs: `.github/workflows/ci.yml`
- The cold-start figure: 21.8 seconds, measured 2026-09-16 against `/health`

- [ ] **Step 2: Write the README**

Replace `README.md` entirely. Structure, in order:

1. **Title and one sentence.** What InvoicePilot is: an accounts-receivable console — invoices, collections pipeline, reminder automations, cash-flow reporting.
2. **Links.** Live demo (the `/demo` URL, which needs no signup), and a one-line note that the API sleeps on its free tier so the first load takes about 25 seconds.
3. **Screenshots.** Three, from `docs/screenshots/`: dashboard, invoices, collections board.
4. **What is real and what is fixtures.** A short table: signup, login, refresh-token rotation, workspace scoping, permissions and the daily demo rebuild run against Postgres; every application screen reads a deterministic ledger generated in `src/lib/data/seed.ts`. Say it plainly — a reader who discovers it themselves discounts everything else on the page.
5. **Architecture.** Next.js on Vercel → Express on Render → Postgres on Neon. Why each free tier, and what each costs: Render's 15-minute idle suspend and its ~22-second wake, Neon's 5-minute suspend, Vercel Hobby's 60-second function ceiling and once-a-day crons. Mention that the demo workspace is rebuilt nightly by `/api/cron/reseed`.
6. **Decisions worth defending.** One paragraph each, linking the file: the token-only design system (`design-system/invoicepilot/MASTER.md`); the server-only data access layer where exactly one module builds a URL (`src/lib/api/client.ts`); refresh rotation confined to the one place Next allows cookie writes (`src/proxy.ts`); the deterministic ledger whose invariants are asserted rather than assumed (`src/lib/data/verify.ts`).
7. **Running it locally.** Prerequisites (Node 22.18+, a Postgres database), `.env` setup pointing at `.env.example`, `npm install && npm run dev`, and the backend's `npm run migrate` / `npm run seed`.
8. **Tests and CI.** `npm test` at the root, `npm test` in `backend/`, and what the two CI jobs do.

Write it as prose for a reader who has never seen the project, not as notes to yourself. Keep it under roughly 200 lines.

- [ ] **Step 3: Verify**

Read the rendered README on GitHub after pushing, or in a Markdown preview. Every link resolves, every command is copy-pasteable, and the screenshots render.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/screenshots
git commit -m "docs: rewrite the README as a project case study"
```

---

### Task 11: Deploy and verify against the real thing

**Files:** none in the repository. This task is configuration and verification.

**Interfaces:** none.

- [ ] **Step 1: Set the new environment variables in Vercel**

In the Vercel project settings, add `DEMO_EMAIL` and `DEMO_PASSWORD` for Production (and Preview, if previews are shared). Use the credentials from the backend's `npm run seed` run. If they are unknown, re-run the seeder in `backend/` with fresh ones:

```bash
npm run seed -- --email demo@invoicepilot.app --password "<generated>"
```

- [ ] **Step 2: Push and let Vercel deploy**

```bash
git push origin main
```

Wait for the deployment to finish, and confirm both CI jobs pass on GitHub.

- [ ] **Step 3: Time a cold demo entry**

Leave the Render service idle for more than fifteen minutes. Then, in a private browser window, open the production `/demo` URL directly (bypassing the landing page, so nothing has warmed the API) and time it.

Expected: the waking screen shows, then the dashboard loads. If the attempt instead fails at roughly ten seconds, the server action is being cut off by the platform's default function timeout rather than by Render: move the login call from `enterDemo()` into a `POST /api/demo` route handler that also exports `maxDuration = 60`, and have `DemoEntry` fetch it. The cookie writes are valid in a route handler.

- [ ] **Step 4: Time a warm demo entry**

Open the production landing page, wait ten seconds, then click "View live demo".
Expected: the dashboard appears in about a second — the warm-up already paid the wake.

- [ ] **Step 5: Set up the keep-awake monitor**

Create an UptimeRobot (or equivalent) HTTP monitor against `https://invoicepilot-0sc2.onrender.com/health` at a 5-minute interval. This closes the open item recorded in `docs/superpowers/plans/2026-09-16-express-backend-port-p3-seeder-and-deployment.md`, and it also protects the 04:00 UTC reseed cron from paying a cold start against its 60-second ceiling.

- [ ] **Step 6: Walk the demo as a visitor would**

On production, signed in as the demo user:

- `/invoices`: mark a row paid, send a row reminder, select three and bulk-mark them paid. The rows change.
- Open an overdue invoice: record a partial payment, then settle the rest. The figure, the badge and the timeline all move.
- `/collections`: drag a card between stages.
- Check every one of the six application areas in the sidebar loads without an error boundary.

- [ ] **Step 7: Check the link preview**

Paste the production URL into a link-preview validator, or into a draft LinkedIn post.
Expected: the 1200×630 card renders with the title and description, from an absolute URL on the production domain.

- [ ] **Step 8: Check phone width**

At 390px wide, load `/demo`, `/dashboard` and `/invoices`.
Expected: no horizontal scroll, the bottom navigation is reachable, and the KPI cards sit two-up as `design-system/invoicepilot/MASTER.md` specifies.

- [ ] **Step 9: Run Lighthouse on the landing page**

Run Lighthouse against the production landing page in Chrome DevTools.
Expected: performance, accessibility, best-practices and SEO all at or above 90. Record any category that falls short, with its top opportunity, rather than fixing it here — a fix belongs to its own task.

- [ ] **Step 10: Record the outcome**

Append a `## Status: done` section to this plan file noting: the measured cold and warm demo entry times, the Lighthouse scores, whether the route-handler fallback in Step 3 was needed, and any step that could not be completed. Then commit:

```bash
git add docs/superpowers/plans/2026-09-16-frontend-demo-and-portfolio-polish.md
git commit -m "docs: record the demo and polish deployment result"
```

---

## Manual steps for the author

These are not code and cannot be done from the repository:

1. **Demo credentials** — provide `DEMO_EMAIL` and `DEMO_PASSWORD`, or re-run the backend seeder to set them, then add both to the Vercel project (Task 11, Step 1).
2. **Keep-awake monitor** — create the UptimeRobot monitor on the Render `/health` endpoint (Task 11, Step 5).
3. **Screenshots** — capture the dashboard, the invoices table and the collections board into `docs/screenshots/` once `/demo` works, so Task 10's README can reference them.

## Deviations from the spec, and why

- **The warm-up ping fires from the marketing layout, not from the hero on mount plus every CTA on hover.** One mount ping per marketing page covers the same visitor, including one who lands on `/pricing` first. A second hover ping would require converting the hero section to a client component for no measurable gain.
- **`/demo` is a Server Component wrapping a client screen**, rather than a single client page. Route segment config — specifically `maxDuration = 60` — cannot be exported from a `"use client"` module, and the default function timeout is shorter than the measured cold start.
- **The invoice detail island is a small context provider with three consumers**, not one wrapper component. The spec requires the figure, the badge and the timeline to respond, and those sit in three different cards on the page.
- **The dialog callbacks are `onRecorded(amountCents, receivedOn)` and `onSent()`**, rather than the spec's single `onDone(result)`. The two dialogs report different things, and a shared name carrying a union type would be decoded at every call site for no gain.
- **The touch icon is rendered by `ImageResponse` (`apple-icon.tsx`)** rather than committed as `apple-icon.png`. Same output, no binary in the repository and no image tooling in the loop.
