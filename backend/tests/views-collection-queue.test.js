import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { sql, withRollback } from "./helpers/database.js";
import { makeCustomer, makeInvoice, makeWorkspace } from "./helpers/factories.js";

after(() => sql.end());

describe("collection_queue", () => {
  it("keeps one invoice per customer", async () => {
    // You chase a customer, not an invoice. Three rows for one account turns a
    // work queue into a list.
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Repeat" });
      await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        dueOffsetDays: -10,
      });
      await makeInvoice(tx, ws, customer, {
        amount: 20_000,
        dueOffsetDays: -12,
      });
      const rows = await tx`
        SELECT * FROM collection_queue WHERE workspace_id = ${ws}
      `;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].balance_cents, 100_000);
    });
  });

  it("excludes invoices that are not overdue", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Current" });
      await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        dueOffsetDays: 14,
      });
      const rows = await tx`
        SELECT * FROM collection_queue WHERE workspace_id = ${ws}
      `;
      assert.equal(rows.length, 0);
    });
  });

  it("decays the recovery score with age", async () => {
    // A big balance dead for 200 days is worth less of your morning than a
    // smaller one that just slipped, so the queue must not rank on value alone.
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const fresh = await makeCustomer(tx, ws, { name: "Fresh" });
      const stale = await makeCustomer(tx, ws, { name: "Stale" });
      await makeInvoice(tx, ws, fresh, {
        amount: 100_000,
        dueOffsetDays: -5,
      });
      await makeInvoice(tx, ws, stale, {
        amount: 150_000,
        dueOffsetDays: -200,
      });
      const rows = await tx`
        SELECT customer_name, recovery_score FROM collection_queue
        WHERE workspace_id = ${ws} ORDER BY recovery_score DESC
      `;
      assert.deepEqual(
        rows.map((row) => row.customer_name),
        ["Fresh", "Stale"],
      );
    });
  });
});
