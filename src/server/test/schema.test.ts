import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { expectConstraintViolation, withRollback } from "./database";
import { makeCustomer, makeInvoice, makeWorkspace } from "./factories";

describe("invoice constraints", () => {
  it("rejects an invoice with a non-positive amount", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Zero Co" });
      await expectConstraintViolation(
        makeInvoice(tx, ws, customer, { amount: 0 }),
        "ck_invoices_amount_positive",
      );
    });
  });

  it("rejects paid_cents greater than amount_cents", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Overpaid Co" });
      await expectConstraintViolation(
        makeInvoice(tx, ws, customer, { amount: 10_000, paid: 10_001 }),
        "ck_invoices_paid_within_amount",
      );
    });
  });

  it("rejects a due date before the issue date", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Backwards Co" });
      await expectConstraintViolation(
        makeInvoice(tx, ws, customer, {
          amount: 10_000,
          dueOffsetDays: -10,
          issueOffsetDays: 0,
        }),
        "ck_invoices_due_after_issue",
      );
    });
  });

  it("rejects a second invoice with the same number in one workspace", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Duplicate Co" });
      await tx.execute(sql`
        INSERT INTO invoices (id, workspace_id, number, customer_id, amount_cents, issue_date, due_date)
        VALUES (gen_random_uuid(), ${ws}, 'INV-1', ${customer}, 10000, CURRENT_DATE, CURRENT_DATE)
      `);
      await expectConstraintViolation(
        tx.execute(sql`
          INSERT INTO invoices (id, workspace_id, number, customer_id, amount_cents, issue_date, due_date)
          VALUES (gen_random_uuid(), ${ws}, 'INV-1', ${customer}, 20000, CURRENT_DATE, CURRENT_DATE)
        `),
        "uq_invoices_workspace_number",
      );
    });
  });
});

describe("balance_cents", () => {
  it("is amount minus paid", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Partial Co" });
      const invoice = await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        paid: 30_000,
      });
      const rows = await tx.execute<{ balance_cents: string }>(
        sql`SELECT balance_cents FROM invoices WHERE id = ${invoice}`,
      );
      expect(Number(rows[0].balance_cents)).toBe(70_000);
    });
  });

  it("cannot be written directly", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Forged Co" });
      const invoice = await makeInvoice(tx, ws, customer, { amount: 100_000 });
      await expect(
        tx.execute(
          sql`UPDATE invoices SET balance_cents = 1 WHERE id = ${invoice}`,
        ),
      ).rejects.toThrow();
    });
  });
});

describe("workspace_members constraints", () => {
  it("rejects a role outside the four", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      await expectConstraintViolation(
        tx.execute(sql`
          INSERT INTO workspace_members (id, workspace_id, invited_email, role)
          VALUES (gen_random_uuid(), ${ws}, 'someone@example.test', 'superuser')
        `),
        "ck_workspace_members_role",
      );
    });
  });

  it("rejects a member with neither a user nor an invited email", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      await expectConstraintViolation(
        tx.execute(sql`
          INSERT INTO workspace_members (id, workspace_id)
          VALUES (gen_random_uuid(), ${ws})
        `),
        "ck_workspace_members_identified",
      );
    });
  });
});

describe("users", () => {
  it("treats email as case-insensitive for uniqueness", async () => {
    await withRollback(async (tx) => {
      await tx.execute(sql`
        INSERT INTO users (id, email, full_name, password_hash)
        VALUES (gen_random_uuid(), 'Sam@example.test', 'Sam', 'x')
      `);
      await expectConstraintViolation(
        tx.execute(sql`
          INSERT INTO users (id, email, full_name, password_hash)
          VALUES (gen_random_uuid(), 'sam@example.test', 'Sam Again', 'x')
        `),
        "uq_users_email_lower",
      );
    });
  });
});

describe("communication_logs", () => {
  it("collides on a repeated idempotency key in one workspace", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Reminded Co" });
      const insert = (key: string) => tx.execute(sql`
        INSERT INTO communication_logs (
          id, workspace_id, customer_id, to_address, subject, body,
          idempotency_key, queued_at
        ) VALUES (
          gen_random_uuid(), ${ws}, ${customer}, 'a@example.test',
          'Reminder', 'Body', ${key}, now()
        )
      `);
      await insert("same-key");
      await expectConstraintViolation(
        insert("same-key"),
        "uq_communication_logs_workspace_key",
      );
    });
  });
});
