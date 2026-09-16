import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { sql, withRollback } from "./helpers/database.js";
import { makeCustomer, makeInvoice, makeWorkspace } from "./helpers/factories.js";

after(() => sql.end());

async function state(tx, invoiceId) {
  const rows = await tx`SELECT * FROM invoice_state WHERE id = ${invoiceId}`;
  return rows[0];
}

describe("invoice_state", () => {
  it("counts days_overdue from the due date", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Late Co" });
      const invoice = await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        dueOffsetDays: -40,
      });
      assert.equal((await state(tx, invoice)).days_overdue, 40);
    });
  });

  it("reports a negative days_overdue before the due date", async () => {
    // Negative rather than zero or null, so a caller can sort every open
    // invoice on one column and get "most overdue first" for free.
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Early Co" });
      const invoice = await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        dueOffsetDays: 10,
      });
      assert.equal((await state(tx, invoice)).days_overdue, -10);
    });
  });

  it("does not call a paid invoice overdue, however late it was", async () => {
    // It was paid late; it is not owed. Owing money is what overdue means.
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Paid Late Co" });
      const invoice = await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        paid: 100_000,
        dueOffsetDays: -40,
        paidOffsetDays: -5,
        status: "paid",
      });
      assert.equal((await state(tx, invoice)).is_overdue, false);
    });
  });

  it("does not call a draft overdue", async () => {
    // A draft was never sent, so nobody owes anything yet. Counting drafts
    // would fill the collections queue with invoices the customer has never
    // seen.
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Draft Co" });
      const invoice = await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        dueOffsetDays: -40,
        status: "draft",
      });
      assert.equal((await state(tx, invoice)).is_overdue, false);
    });
  });

  it("calls a partially paid late invoice overdue for its balance", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Partial Co" });
      const invoice = await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        paid: 30_000,
        dueOffsetDays: -15,
        status: "partially_paid",
      });
      const row = await state(tx, invoice);
      assert.equal(row.is_overdue, true);
      assert.equal(row.balance_cents, 70_000);
      assert.equal(row.customer_name, "Partial Co");
    });
  });
});
