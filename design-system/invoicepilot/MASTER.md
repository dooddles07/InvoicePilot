# InvoicePilot — Design System (Master)

Global source of truth. Page-specific overrides live in `design-system/invoicepilot/pages/<page>.md`
and win over anything here. The implementation is `src/app/globals.css`; this file explains
*why*, the CSS holds the values.

## Direction

A financial operations console, not an admin dashboard. Dense but calm: strong typographic
hierarchy, subtle borders, soft elevation, generous whitespace between *groups* and tight
spacing *within* them. Colour is reserved for status, risk and direction of money — never
decoration.

Derived from UI/UX Pro Max (`--design-system`, variance 4 / motion 5 / density 8), which
returned the **Data-Dense Dashboard** style and a **Real-Time / Operations** landing pattern.

Two of its recommendations were deliberately overridden:

| It recommended | We ship | Why |
|---|---|---|
| Dark-first palette (`#020617`) | **Light-first**, full dark mode | The brief specifies a soft neutral background with dark mode secondary. Finance tools are read in daylight offices. |
| IBM Plex Sans | **Geist Sans / Geist Mono** | The brief prioritises Inter / Geist / Manrope. Geist keeps the tabular-figure requirement and reads less institutional. |

## Colour

Semantic tokens only. No component ever hardcodes a hex value.

```
--background --foreground --card --card-foreground --popover --popover-foreground
--primary --primary-foreground --secondary --secondary-foreground
--muted --muted-foreground --accent --accent-foreground
--brand --brand-foreground --brand-muted
--success --warning --danger  (+ -foreground and -muted for each)
--border --input --ring
--chart-1..5   --aging-current --aging-1..4
```

**Light** — background off-white `oklch(0.985 0.002 106)`, cards pure white so data sits on the
brightest surface. Primary is deep navy ink `#0F172A`; brand indigo `#4F46E5` carries links,
active nav, focus rings and the AI surfaces.

**Dark** — a re-tune, not an inversion. Background `oklch(0.174 0.026 264)` (deep navy-charcoal,
never black), cards one step lighter. Primary flips to near-white so the confident action still
reads as the confident action. Success / warning / danger are lightened and desaturated to hold
4.5:1 against the dark ground.

Two rules that matter more than the values:

1. **`--brand` is separate from `--secondary`.** shadcn uses `--secondary` structurally for quiet
   neutral buttons; painting it indigo would turn every `variant="secondary"` control into a brand
   button. The brief's "secondary: blue/indigo" lives in `--brand`.
2. **Status is never colour alone.** `InvoiceStatusBadge` and `RiskBadge` always pair a colour with
   an icon and a word.

Aging has its own five-step ramp (`--aging-*`) running emerald → blue → amber → orange → red, so
"current" reads as healthy rather than as just another category colour.

## Typography

Geist Sans throughout, Geist Mono for references and codes.

| Token | Size / line-height | Use |
|---|---|---|
| `text-display` | 48 / 1.05, -0.03em | Marketing hero only |
| `text-h1` | 32 / 1.15 | Page title, KPI figures |
| `text-h2` | 24 / 1.25 | Section headline, panel figures |
| `text-h3` | 18 / 1.35 | Card titles |
| `text-body` | 14 / 1.57 | Default body |
| `text-small` | 13 / 1.5 | Dense rows, secondary text |
| `text-caption` | 12 / 1.45 | Metadata, labels, legends |

Every figure a user compares vertically uses tabular numerals — `.tnum` for inline numbers,
`.figure` for large headline amounts (adds -0.022em tracking so the number reads as one object).

## Spacing, radius, elevation

Density 8/10 — dashboard-tight. `--space-1..6` = 8 / 12 / 16 / 20 / 24 / 32px. App screens live at
the 12–20px end; marketing pages open up to 32px+.

Radius base `0.75rem`; `sm/md/lg/xl` derive from it. Three elevations only (`shadow-e1..e3`) — cards
sit at e1, popovers at e2, modals at e3. No heavy drop shadows.

## Motion

All variants are defined once in `src/lib/motion.ts` and consumed through `useMotion()`, which
returns a reduced set when the user prefers reduced motion. Components never branch on
accessibility themselves.

| Name | Use | Spec |
|---|---|---|
| `fadeUp` | Page and section entrance | opacity + 8px rise, 220ms, ease-out |
| `container` / `item` | KPI grids, card lists | 60ms stagger, 10px rise, 280ms |
| `modal` | Dialogs, sheets | spring 380/30 |
| `draw` | Chart and connector reveal | pathLength, 600ms |

`globals.css` also carries a global `prefers-reduced-motion` block that flattens every transition,
so third-party animation (Recharts, Base UI) degrades too.

Charts pass `isAnimationActive={useMotionSafe()}`. Decorative charts (KPI sparklines, the aging
donut) are `aria-hidden` **and** `tabIndex={-1}` — Recharts makes its surface focusable by default,
which would otherwise put four dead stops in the tab order.

## Breakpoints

| Width | Layout |
|---|---|
| ≥1024 | Sidebar shell, multi-column grids |
| 768–1023 | **Drawer + bottom nav**, single-column content |
| <768 | Bottom nav, stacked cards, 2-up KPI row |

The shell breakpoint is `lg` (1024), not shadcn's default `md` (768): at tablet width a 16rem
sidebar leaves too little room for financial tables. `MOBILE_BREAKPOINT` in
`src/hooks/use-mobile.ts` is raised to match.

KPI cards are 2-up from the smallest screen so all four headline figures stay above the fold on a
phone. Search and the full navigation drawer remain reachable at every width — the search trigger
collapses to an icon button rather than disappearing.

## Component rules

- Reuse before writing. Primitives in `src/components/ui/`, product components in
  `src/components/invoicepilot/`, screen sections in `src/components/dashboard/` etc.
- `LinkButton` is the only way to render a button that navigates. Base UI assumes a native
  `<button>` unless told otherwise; the `nativeButton={false}` flag is set there once.
- Money formatting lives in `src/lib/format.ts` and nowhere else. Money is integer cents in every
  type and prop.
- Empty states are never blank: `EmptyState` either celebrates (nothing overdue) or offers the one
  action that fills the screen.

## Data

`src/lib/data/seed.ts` generates one deterministic invoice ledger; every KPI, bucket, chart series
and customer statistic in `src/lib/data/index.ts` is *derived* from it. `verify.ts` asserts the
invariants (line items sum to the invoice, aging partitions the open book exactly once, payments
reconcile against invoices, customer rollups match their own invoices) and runs on the dashboard in
development.
