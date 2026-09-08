/**
 * Formatting lives here once. Money is stored and passed as integer cents
 * everywhere in the app — float dollars never appear in a type or a prop.
 */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const USD_WHOLE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const COMPACT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function money(cents: number): string {
  return USD.format(cents / 100);
}

/** Dashboard headline figures: cents are noise at this size. */
export function moneyWhole(cents: number): string {
  return USD_WHOLE.format(cents / 100);
}

/** Axis labels and dense cells: $124.9K */
export function moneyCompact(cents: number): string {
  return COMPACT.format(cents / 100);
}

export function percent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

/** Signed change, e.g. "+8.4%" / "-2.1%". */
export function delta(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

const DATE_MED = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const DATE_SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

export function formatDate(iso: string): string {
  return DATE_MED.format(new Date(iso));
}

export function formatDateShort(iso: string): string {
  return DATE_SHORT.format(new Date(iso));
}

const MS_DAY = 86_400_000;

/** Whole days from `iso` to `now`. Positive means in the past. */
export function daysSince(iso: string, now: Date = new Date()): number {
  const a = Date.parse(iso);
  return Math.floor((now.getTime() - a) / MS_DAY);
}

/** Whole days from `now` to `iso`. Positive means in the future. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return -daysSince(iso, now);
}

/** "34 days late" / "due in 5 days" / "due today" */
export function dueLabel(dueIso: string, now: Date = new Date()): string {
  const late = daysSince(dueIso, now);
  if (late === 0) return "due today";
  if (late > 0) return `${late} ${late === 1 ? "day" : "days"} late`;
  const inDays = -late;
  return `due in ${inDays} ${inDays === 1 ? "day" : "days"}`;
}

export function initials(name: string): string {
  return name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
