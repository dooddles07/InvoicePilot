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
      // reaching billing:write, which belongs to a parked preview screen.
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
