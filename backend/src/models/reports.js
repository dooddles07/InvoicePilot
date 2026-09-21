/**
 * Reports. Reads invoices, payments and customers directly rather than
 * owning a table of its own -- every figure here is a reduction over data
 * three other models already own.
 *
 * Point-in-time reconstruction (outstanding/overdue "as of" a date, for the
 * KPI trends) is more correct here than the fixture ledger it replaces: the
 * fixture had no per-payment dates in scope, so it approximated a
 * partially-paid invoice as fully outstanding if it later settled. Postgres
 * has payments.received_at, so this reconstructs the true balance as of each
 * date instead of approximating it -- the numbers will not match the
 * fixtures to the cent. A deliberate improvement, not a regression.
 *
 * Every "N points at once" query below returns the offset(s) it was asked
 * for alongside each row, rather than requiring the caller to match rows
 * back by array position or by re-deriving an offset from a returned date --
 * two dates can land in the same place in a sorted result for different
 * reasons, and position is not identity.
 */
import { inWorkspace } from "./scope.js";

const WEEKLY_OFFSETS = Array.from({ length: 12 }, (_, i) => (11 - i) * 7); // 77..0

/**
 * Outstanding and overdue balance at each offset (days ago). paid_by_point
 * sums each invoice's payments received by each point; the outer query
 * applies that against amount_cents, gated by FILTER on which invoices count
 * as of that point.
 */
async function balanceAtOffsets(sql, workspaceId, offsets) {
  return sql`
    WITH points AS (
      SELECT o AS offset_days, (CURRENT_DATE - o)::date AS at
      FROM unnest(${offsets}::int[]) AS o
    ),
    paid_by_point AS (
      SELECT pt.offset_days, p.invoice_id, SUM(p.amount_cents) AS paid_cents
      FROM points pt
      JOIN payments p ON p.workspace_id = ${workspaceId} AND p.received_at::date <= pt.at
      GROUP BY pt.offset_days, p.invoice_id
    )
    SELECT
      pt.offset_days,
      COALESCE(SUM(GREATEST(i.amount_cents - COALESCE(pbp.paid_cents, 0), 0))
        FILTER (WHERE i.issue_date <= pt.at), 0)::bigint AS outstanding_cents,
      COALESCE(SUM(GREATEST(i.amount_cents - COALESCE(pbp.paid_cents, 0), 0))
        FILTER (WHERE i.due_date < pt.at), 0)::bigint AS overdue_cents
    FROM points pt
    LEFT JOIN invoices i
      ON i.workspace_id = ${workspaceId} AND i.status <> 'draft'
    LEFT JOIN paid_by_point pbp
      ON pbp.offset_days = pt.offset_days AND pbp.invoice_id = i.id
    GROUP BY pt.offset_days
  `;
}

/** Cents received in each (fromOffset, toOffset] window, paired by index --
 *  fromOffsets[i]/toOffsets[i] is one window, tagged with both offsets so
 *  the caller matches results without guessing at row order. */
async function collectedInWindows(sql, workspaceId, fromOffsets, toOffsets) {
  return sql`
    WITH windows AS (
      SELECT f AS from_offset, t AS to_offset,
        (CURRENT_DATE - f)::date AS from_at, (CURRENT_DATE - t)::date AS to_at
      FROM unnest(${fromOffsets}::int[], ${toOffsets}::int[]) AS u(f, t)
    )
    SELECT w.from_offset, w.to_offset,
      COALESCE(SUM(p.amount_cents), 0)::bigint AS collected_cents
    FROM windows w
    LEFT JOIN payments p
      ON p.workspace_id = ${workspaceId}
     AND p.received_at::date > w.from_at AND p.received_at::date <= w.to_at
    GROUP BY w.from_offset, w.to_offset
  `;
}

/** Value due in each window and how much of it has settled since --
 *  collection rate's numerator and denominator, one row per window. */
async function dueAndSettledInWindows(sql, workspaceId, fromOffsets, toOffsets) {
  return sql`
    WITH windows AS (
      SELECT f AS from_offset, t AS to_offset,
        (CURRENT_DATE - f)::date AS from_at, (CURRENT_DATE - t)::date AS to_at
      FROM unnest(${fromOffsets}::int[], ${toOffsets}::int[]) AS u(f, t)
    )
    SELECT w.from_offset, w.to_offset,
      COALESCE(SUM(i.amount_cents), 0)::bigint AS due_cents,
      COALESCE(SUM(CASE WHEN i.paid_date IS NOT NULL THEN i.amount_cents ELSE i.paid_cents END), 0)::bigint
        AS settled_cents
    FROM windows w
    LEFT JOIN invoices i
      ON i.workspace_id = ${workspaceId} AND i.status <> 'draft'
     AND i.due_date > w.from_at AND i.due_date <= w.to_at
    GROUP BY w.from_offset, w.to_offset
  `;
}

const pctChange = (now, before) => (before === 0 ? 0 : ((now - before) / before) * 100);
const rateOf = (row) => (row.due_cents === 0 ? 100 : (row.settled_cents / row.due_cents) * 100);

export async function getSummary(sql, workspaceId) {
  const [balanceRows, collectedWeekly, collected30dRows, rateWeekly, ratePriorRows] =
    await Promise.all([
      balanceAtOffsets(sql, workspaceId, [...WEEKLY_OFFSETS, 30]),
      collectedInWindows(
        sql,
        workspaceId,
        WEEKLY_OFFSETS.map((o) => o + 7),
        WEEKLY_OFFSETS,
      ),
      collectedInWindows(sql, workspaceId, [30, 60], [0, 30]),
      dueAndSettledInWindows(
        sql,
        workspaceId,
        WEEKLY_OFFSETS.map((o) => o + 395),
        WEEKLY_OFFSETS.map((o) => o + 30),
      ),
      dueAndSettledInWindows(sql, workspaceId, [425], [60]),
    ]);

  const byOffset = (rows, key) => new Map(rows.map((r) => [r[key], r]));
  const balances = byOffset(balanceRows, "offset_days");
  const now = balances.get(0);
  const thirtyDaysAgo = balances.get(30);

  const collected30d = collected30dRows.find((r) => r.from_offset === 30).collected_cents;
  const collected30dPrior = collected30dRows.find((r) => r.from_offset === 60).collected_cents;

  // dueAndSettledInWindows was asked for windows ending offset+30 (the
  // settlement buffer), so "as of offset days ago" is looked up at
  // to_offset - 30, not to_offset itself; rateNow is the offset=0 case.
  const rateNow = rateOf(rateWeekly.find((r) => r.to_offset === 30));
  const ratePrior = rateOf(ratePriorRows[0]);

  const collectedByTo = byOffset(collectedWeekly, "to_offset");
  const rateByOffset = new Map(rateWeekly.map((r) => [r.to_offset - 30, r]));

  return {
    outstanding_cents: now.outstanding_cents,
    overdue_cents: now.overdue_cents,
    collected_30d_cents: collected30d,
    collection_rate: rateNow,
    outstanding_change: pctChange(now.outstanding_cents, thirtyDaysAgo.outstanding_cents),
    overdue_change: pctChange(now.overdue_cents, thirtyDaysAgo.overdue_cents),
    collected_change: pctChange(collected30d, collected30dPrior),
    collection_rate_change: rateNow - ratePrior,
    outstanding_trend: WEEKLY_OFFSETS.map((o) => Math.round(balances.get(o).outstanding_cents / 100)),
    overdue_trend: WEEKLY_OFFSETS.map((o) => Math.round(balances.get(o).overdue_cents / 100)),
    collected_trend: WEEKLY_OFFSETS.map((o) => Math.round(collectedByTo.get(o).collected_cents / 100)),
    collection_rate_trend: WEEKLY_OFFSETS.map((o) => Math.round(rateOf(rateByOffset.get(o)))),
  };
}

/**
 * expected/actual/overdue per bucket, day-width buckets (the 7d/30d/90d
 * ranges). LATERAL because invoices and payments need different join
 * conditions against the same bucket set -- a single JOIN cannot express
 * both without duplicating rows.
 */
export async function getCashFlowDays(sql, workspaceId, bucketDays, bucketCount) {
  return sql`
    WITH buckets AS (
      SELECT gs AS i,
        (CURRENT_DATE - (${bucketCount} - gs) * ${bucketDays}::int)::date AS start_at,
        (CURRENT_DATE - (${bucketCount} - gs - 1) * ${bucketDays}::int)::date AS end_at
      FROM generate_series(0, ${bucketCount} - 1) AS gs
    )
    SELECT b.i, b.start_at, b.end_at,
      COALESCE(inv.expected_cents, 0)::bigint AS expected_cents,
      COALESCE(inv.overdue_cents, 0)::bigint AS overdue_cents,
      COALESCE(pay.actual_cents, 0)::bigint AS actual_cents
    FROM buckets b
    LEFT JOIN LATERAL (
      SELECT SUM(amount_cents) AS expected_cents,
             SUM(balance_cents) FILTER (WHERE paid_date IS NULL) AS overdue_cents
      FROM invoices
      WHERE workspace_id = ${workspaceId} AND status <> 'draft'
        AND due_date > b.start_at AND due_date <= b.end_at
    ) inv ON true
    LEFT JOIN LATERAL (
      SELECT SUM(amount_cents) AS actual_cents
      FROM payments
      WHERE workspace_id = ${workspaceId}
        AND received_at::date > b.start_at AND received_at::date <= b.end_at
    ) pay ON true
    ORDER BY b.i
  `;
}

/** The 12m range: real calendar months rather than fixed-width buckets. */
export async function getCashFlowMonths(sql, workspaceId) {
  return sql`
    WITH buckets AS (
      SELECT gs AS i,
        (date_trunc('month', CURRENT_DATE) - (11 - gs) * interval '1 month')::date AS start_at,
        (date_trunc('month', CURRENT_DATE) - (10 - gs) * interval '1 month')::date AS end_at
      FROM generate_series(0, 11) AS gs
    )
    SELECT b.i, b.start_at, b.end_at,
      COALESCE(inv.expected_cents, 0)::bigint AS expected_cents,
      COALESCE(inv.overdue_cents, 0)::bigint AS overdue_cents,
      COALESCE(pay.actual_cents, 0)::bigint AS actual_cents
    FROM buckets b
    LEFT JOIN LATERAL (
      SELECT SUM(amount_cents) AS expected_cents,
             SUM(balance_cents) FILTER (WHERE paid_date IS NULL) AS overdue_cents
      FROM invoices
      WHERE workspace_id = ${workspaceId} AND status <> 'draft'
        AND due_date >= b.start_at AND due_date < b.end_at
    ) inv ON true
    LEFT JOIN LATERAL (
      SELECT SUM(amount_cents) AS actual_cents
      FROM payments
      WHERE workspace_id = ${workspaceId}
        AND received_at::date >= b.start_at AND received_at::date < b.end_at
    ) pay ON true
    ORDER BY b.i
  `;
}

/** The five aging buckets, including any with zero invoices: a bare
 *  GROUP BY over the open book alone would drop an empty bucket and the
 *  chart would silently lose a bar. share comes from a window over the
 *  aggregate rather than a second pass. */
export async function getAgingBuckets(sql, workspaceId) {
  return sql`
    WITH open_book AS (
      SELECT balance_cents,
        CASE
          WHEN days_overdue <= 0 THEN 'current'
          WHEN days_overdue <= 30 THEN '1_30'
          WHEN days_overdue <= 60 THEN '31_60'
          WHEN days_overdue <= 90 THEN '61_90'
          ELSE '90_plus'
        END AS key
      FROM invoice_state
      ${inWorkspace(sql, workspaceId)} AND status NOT IN ('draft', 'paid')
    )
    SELECT b.key,
      COALESCE(SUM(o.balance_cents), 0)::bigint AS amount_cents,
      COUNT(o.balance_cents)::int AS invoice_count,
      COALESCE(SUM(o.balance_cents), 0) * 100.0
        / NULLIF(SUM(SUM(o.balance_cents)) OVER (), 0) AS share
    FROM (VALUES ('current'), ('1_30'), ('31_60'), ('61_90'), ('90_plus')) AS b(key)
    LEFT JOIN open_book o ON o.key = b.key
    GROUP BY b.key
    ORDER BY array_position(ARRAY['current', '1_30', '31_60', '61_90', '90_plus'], b.key)
  `;
}

/** The same partition as getAgingBuckets, sliced by customer instead of
 *  summed across all of them -- how a finance manager actually works the
 *  report. Customers with nothing open are left out entirely. */
export async function getAgingByCustomer(sql, workspaceId) {
  return sql`
    WITH open_book AS (
      SELECT customer_id, balance_cents,
        CASE
          WHEN days_overdue <= 0 THEN 'current'
          WHEN days_overdue <= 30 THEN '1_30'
          WHEN days_overdue <= 60 THEN '31_60'
          WHEN days_overdue <= 90 THEN '61_90'
          ELSE '90_plus'
        END AS key
      FROM invoice_state
      ${inWorkspace(sql, workspaceId)} AND status NOT IN ('draft', 'paid')
    )
    SELECT c.id AS customer_id, c.name AS customer_name,
      COALESCE(SUM(o.balance_cents) FILTER (WHERE o.key = 'current'), 0)::bigint AS current_cents,
      COALESCE(SUM(o.balance_cents) FILTER (WHERE o.key = '1_30'), 0)::bigint AS c1_30_cents,
      COALESCE(SUM(o.balance_cents) FILTER (WHERE o.key = '31_60'), 0)::bigint AS c31_60_cents,
      COALESCE(SUM(o.balance_cents) FILTER (WHERE o.key = '61_90'), 0)::bigint AS c61_90_cents,
      COALESCE(SUM(o.balance_cents) FILTER (WHERE o.key = '90_plus'), 0)::bigint AS c90_plus_cents,
      COALESCE(SUM(o.balance_cents), 0)::bigint AS total_cents
    FROM customers c
    JOIN open_book o ON o.customer_id = c.id
    WHERE c.workspace_id = ${workspaceId}
    GROUP BY c.id, c.name
    ORDER BY total_cents DESC
  `;
}
