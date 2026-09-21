/**
 * GET /api/invoices, GET /api/invoices/:id, GET /api/invoices/:id/events.
 *
 * invoice_state and customer_stats have their own suites for the derivation
 * rules (days_overdue, is_overdue, risk grading); this file only covers what
 * the route and controller add on top -- filtering, paging, the items split,
 * and tenancy.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { issueAccessToken, makePrincipal } from "../src/lib/security.js";
import { insertEmailTemplates } from "../src/models/notifications.js";
import { sql } from "./helpers/database.js";
import {
  makeCollectionEvent,
  makeCustomer,
  makeInvoice,
  makeInvoiceItems,
  makeUser,
  makeWorkspace,
} from "./helpers/factories.js";
import { TEST_CONFIG, withApp } from "./helpers/app.js";

after(() => sql.end());

async function tokenFor(workspaceId, role = "owner") {
  return issueAccessToken(
    makePrincipal(randomUUID(), workspaceId, role),
    TEST_CONFIG.secretKey,
  );
}

async function tokenForUser(userId, workspaceId, role = "owner") {
  return issueAccessToken(makePrincipal(userId, workspaceId, role), TEST_CONFIG.secretKey);
}

describe("GET /api/invoices", () => {
  it("lists only this workspace's invoices, with risk and next_action attached", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Acme Co" });
      await makeInvoice(tx, ws, customer, { amount: 100_000, dueOffsetDays: -10 });

      const response = await send("GET", "/api/invoices", { token: await tokenFor(ws) });

      assert.equal(response.status, 200);
      assert.equal(response.body.total, 1);
      assert.equal(response.body.data.length, 1);
      const invoice = response.body.data[0];
      assert.equal(invoice.customer_name, "Acme Co");
      assert.equal(invoice.is_overdue, true);
      assert.equal(invoice.next_action, "Send a friendly reminder");
      assert.ok(["low", "medium", "high"].includes(invoice.risk));
      assert.equal(invoice.items, undefined);
    });
  });

  it("does not return another workspace's invoices", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const theirCustomer = await makeCustomer(tx, theirs, { name: "Other Co" });
      await makeInvoice(tx, theirs, theirCustomer, { amount: 50_000, dueOffsetDays: 10 });

      const response = await send("GET", "/api/invoices", { token: await tokenFor(mine) });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, []);
      assert.equal(response.body.total, 0);
    });
  });

  it("filters by status", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Filter Co" });
      await makeInvoice(tx, ws, customer, { amount: 10_000, status: "draft", dueOffsetDays: 30 });
      await makeInvoice(tx, ws, customer, { amount: 20_000, status: "sent", dueOffsetDays: 30 });

      const response = await send("GET", "/api/invoices?status=draft", {
        token: await tokenFor(ws),
      });

      assert.equal(response.body.total, 1);
      assert.equal(response.body.data[0].status, "draft");
    });
  });

  it("filters by overdue", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Overdue Co" });
      await makeInvoice(tx, ws, customer, { amount: 10_000, dueOffsetDays: -5 });
      await makeInvoice(tx, ws, customer, { amount: 20_000, dueOffsetDays: 20 });

      const response = await send("GET", "/api/invoices?overdue=true", {
        token: await tokenFor(ws),
      });

      assert.equal(response.body.total, 1);
      assert.equal(response.body.data[0].is_overdue, true);
    });
  });

  it("searches by invoice number and by customer name", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const acme = await makeCustomer(tx, ws, { name: "Acme Rockets" });
      const globex = await makeCustomer(tx, ws, { name: "Globex" });
      await makeInvoice(tx, ws, acme, { amount: 10_000, dueOffsetDays: 30 });
      await makeInvoice(tx, ws, globex, { amount: 20_000, dueOffsetDays: 30 });

      const response = await send("GET", "/api/invoices?search=rockets", {
        token: await tokenFor(ws),
      });

      assert.equal(response.body.total, 1);
      assert.equal(response.body.data[0].customer_name, "Acme Rockets");
    });
  });

  it("pages with limit and offset, newest-sorted ties broken by id", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Paging Co" });
      for (let i = 0; i < 3; i++) {
        await makeInvoice(tx, ws, customer, { amount: 10_000, dueOffsetDays: 30 });
      }

      const response = await send("GET", "/api/invoices?limit=2&offset=1", {
        token: await tokenFor(ws),
      });

      assert.equal(response.body.total, 3);
      assert.equal(response.body.data.length, 2);
    });
  });

  it("rejects a limit past the maximum", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const response = await send("GET", "/api/invoices?limit=5000", {
        token: await tokenFor(ws),
      });
      assert.equal(response.status, 422);
    });
  });
});

describe("GET /api/invoices/:invoiceId", () => {
  it("includes line items and customer context on the detail response", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Detail Co", terms: 45 });
      const invoiceId = await makeInvoice(tx, ws, customer, {
        amount: 15_000,
        dueOffsetDays: 30,
      });
      await makeInvoiceItems(tx, ws, invoiceId, [
        { description: "Widgets", quantity: 3, unitPriceCents: 5_000 },
      ]);

      const response = await send("GET", `/api/invoices/${invoiceId}`, {
        token: await tokenFor(ws),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.items.length, 1);
      assert.equal(response.body.items[0].description, "Widgets");
      assert.equal(response.body.items[0].amount_cents, 15_000);

      assert.equal(response.body.customer.id, customer);
      assert.equal(response.body.customer.name, "Detail Co");
      assert.equal(response.body.customer.payment_terms_days, 45);
      assert.equal(typeof response.body.customer.outstanding_cents, "number");
    });
  });

  it("keeps issue_date, due_date and paid_date as plain YYYY-MM-DD strings", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Date Co" });
      const invoiceId = await makeInvoice(tx, ws, customer, {
        amount: 10_000,
        dueOffsetDays: 30,
      });

      const response = await send("GET", `/api/invoices/${invoiceId}`, {
        token: await tokenFor(ws),
      });

      assert.match(response.body.issue_date, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(response.body.due_date, /^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("answers 404 for another workspace's invoice, not 403", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const theirCustomer = await makeCustomer(tx, theirs, { name: "Other Co" });
      const theirInvoice = await makeInvoice(tx, theirs, theirCustomer, {
        amount: 10_000,
        dueOffsetDays: 30,
      });

      const response = await send("GET", `/api/invoices/${theirInvoice}`, {
        token: await tokenFor(mine),
      });

      assert.equal(response.status, 404);
      assert.equal(response.body.detail, "Invoice not found");
    });
  });

  it("answers 404 identically for an invoice that does not exist", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const response = await send("GET", `/api/invoices/${randomUUID()}`, {
        token: await tokenFor(ws),
      });
      assert.equal(response.status, 404);
      assert.equal(response.body.detail, "Invoice not found");
    });
  });
});

describe("GET /api/invoices/:invoiceId/events", () => {
  it("returns this invoice's events, newest first, with no total field", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Events Co" });
      const invoiceId = await makeInvoice(tx, ws, customer, {
        amount: 10_000,
        dueOffsetDays: 10,
      });
      await makeCollectionEvent(tx, ws, customer, {
        invoiceId,
        type: "invoice_sent",
        occurredOffsetDays: -10,
      });
      await makeCollectionEvent(tx, ws, customer, {
        invoiceId,
        type: "reminder_sent",
        occurredOffsetDays: -2,
      });

      const response = await send("GET", `/api/invoices/${invoiceId}/events`, {
        token: await tokenFor(ws),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 2);
      assert.equal(response.body.data[0].type, "reminder_sent");
      assert.equal(response.body.data[1].type, "invoice_sent");
      assert.equal(response.body.total, undefined);
    });
  });

  it("answers 404 for another workspace's invoice before touching events", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const theirCustomer = await makeCustomer(tx, theirs, { name: "Other Co" });
      const theirInvoice = await makeInvoice(tx, theirs, theirCustomer, {
        amount: 10_000,
        dueOffsetDays: 30,
      });

      const response = await send("GET", `/api/invoices/${theirInvoice}/events`, {
        token: await tokenFor(mine),
      });

      assert.equal(response.status, 404);
    });
  });
});

describe("POST /api/invoices", () => {
  it("creates a draft invoice with the item total summed server-side", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const user = await makeUser(tx);
      const customer = await makeCustomer(tx, ws, { name: "New Co" });

      const response = await send("POST", "/api/invoices", {
        token: await tokenForUser(user, ws),
        body: {
          customer_id: customer,
          issue_date: "2026-01-01",
          due_date: "2026-01-31",
          items: [
            { description: "Design", quantity: 2, unit_price_cents: 5_000 },
            { description: "Build", quantity: 1, unit_price_cents: 12_000 },
          ],
        },
      });

      assert.equal(response.status, 201);
      assert.equal(response.body.status, "draft");
      assert.equal(response.body.amount_cents, 22_000);
      assert.equal(response.body.items.length, 2);
      assert.match(response.body.number, /^INV-\d{4}-\d{5}$/);
    });
  });

  it("answers 404 for a customer that belongs to another workspace", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const user = await makeUser(tx);
      const theirCustomer = await makeCustomer(tx, theirs, { name: "Other Co" });

      const response = await send("POST", "/api/invoices", {
        token: await tokenForUser(user, mine),
        body: {
          customer_id: theirCustomer,
          issue_date: "2026-01-01",
          due_date: "2026-01-31",
          items: [{ description: "Design", quantity: 1, unit_price_cents: 5_000 }],
        },
      });

      assert.equal(response.status, 404);
    });
  });

  it("rejects an invoice with no line items", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const user = await makeUser(tx);
      const customer = await makeCustomer(tx, ws, { name: "Empty Co" });

      const response = await send("POST", "/api/invoices", {
        token: await tokenForUser(user, ws),
        body: {
          customer_id: customer,
          issue_date: "2026-01-01",
          due_date: "2026-01-31",
          items: [],
        },
      });

      assert.equal(response.status, 422);
    });
  });
});

describe("PATCH /api/invoices/:invoiceId", () => {
  it("updates po_number and notes", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const user = await makeUser(tx);
      const customer = await makeCustomer(tx, ws, { name: "Edit Co" });
      const invoiceId = await makeInvoice(tx, ws, customer, { amount: 10_000, dueOffsetDays: 10 });

      const response = await send("PATCH", `/api/invoices/${invoiceId}`, {
        token: await tokenForUser(user, ws),
        body: { po_number: "PO-999", notes: "Rush order" },
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.po_number, "PO-999");
      assert.equal(response.body.notes, "Rush order");
    });
  });

  it("marks a sent invoice disputed and logs it", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const user = await makeUser(tx);
      const customer = await makeCustomer(tx, ws, { name: "Dispute Co" });
      const invoiceId = await makeInvoice(tx, ws, customer, {
        amount: 10_000,
        status: "sent",
        dueOffsetDays: 10,
      });

      const response = await send("PATCH", `/api/invoices/${invoiceId}`, {
        token: await tokenForUser(user, ws),
        body: { status: "disputed" },
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.status, "disputed");

      const events = await send("GET", `/api/invoices/${invoiceId}/events`, {
        token: await tokenForUser(user, ws),
      });
      assert.equal(events.body.data[0].type, "dispute_raised");
    });
  });

  it("refuses to dispute a draft invoice", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const user = await makeUser(tx);
      const customer = await makeCustomer(tx, ws, { name: "Draft Dispute Co" });
      const invoiceId = await makeInvoice(tx, ws, customer, {
        amount: 10_000,
        status: "draft",
        dueOffsetDays: 10,
      });

      const response = await send("PATCH", `/api/invoices/${invoiceId}`, {
        token: await tokenForUser(user, ws),
        body: { status: "disputed" },
      });

      assert.equal(response.status, 409);
    });
  });

  it("rejects an empty patch", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const user = await makeUser(tx);
      const customer = await makeCustomer(tx, ws, { name: "Noop Co" });
      const invoiceId = await makeInvoice(tx, ws, customer, { amount: 10_000, dueOffsetDays: 10 });

      const response = await send("PATCH", `/api/invoices/${invoiceId}`, {
        token: await tokenForUser(user, ws),
        body: {},
      });

      assert.equal(response.status, 422);
    });
  });

  it("answers 404 for another workspace's invoice", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const user = await makeUser(tx);
      const theirCustomer = await makeCustomer(tx, theirs, { name: "Other Co" });
      const theirInvoice = await makeInvoice(tx, theirs, theirCustomer, {
        amount: 10_000,
        dueOffsetDays: 10,
      });

      const response = await send("PATCH", `/api/invoices/${theirInvoice}`, {
        token: await tokenForUser(user, mine),
        body: { notes: "hijacked" },
      });

      assert.equal(response.status, 404);
    });
  });
});

describe("POST /api/invoices/:invoiceId/send", () => {
  it("sends a draft invoice, transitions it to sent, and logs the send", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      await insertEmailTemplates(tx, ws);
      const user = await makeUser(tx, { fullName: "Sender Person" });
      const customer = await makeCustomer(tx, ws, { name: "Send Co" });
      const invoiceId = await makeInvoice(tx, ws, customer, {
        amount: 10_000,
        status: "draft",
        dueOffsetDays: 10,
      });

      const response = await send("POST", `/api/invoices/${invoiceId}/send`, {
        token: await tokenForUser(user, ws),
        body: { tone: "friendly", idempotency_key: "send-1" },
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.status, "sent");
      assert.ok(response.body.sent_at);

      const events = await send("GET", `/api/invoices/${invoiceId}/events`, {
        token: await tokenForUser(user, ws),
      });
      assert.equal(events.body.data[0].type, "invoice_sent");
    });
  });

  it("the same idempotency key twice does not send or log twice", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      await insertEmailTemplates(tx, ws);
      const user = await makeUser(tx);
      const customer = await makeCustomer(tx, ws, { name: "Idempotent Co" });
      const invoiceId = await makeInvoice(tx, ws, customer, {
        amount: 10_000,
        status: "draft",
        dueOffsetDays: 10,
      });
      const token = await tokenForUser(user, ws);
      const body = { tone: "friendly", idempotency_key: "same-key" };

      const first = await send("POST", `/api/invoices/${invoiceId}/send`, { token, body });
      const second = await send("POST", `/api/invoices/${invoiceId}/send`, { token, body });

      assert.equal(first.status, 200);
      assert.equal(second.status, 200);

      const events = await send("GET", `/api/invoices/${invoiceId}/events`, { token });
      assert.equal(events.body.data.length, 1);
    });
  });

  it("a later reminder does not re-send the initial invoice_sent event", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      await insertEmailTemplates(tx, ws);
      const user = await makeUser(tx);
      const customer = await makeCustomer(tx, ws, { name: "Reminder Co" });
      const invoiceId = await makeInvoice(tx, ws, customer, {
        amount: 10_000,
        status: "sent",
        dueOffsetDays: -20,
      });
      const token = await tokenForUser(user, ws);

      const response = await send("POST", `/api/invoices/${invoiceId}/send`, {
        token,
        body: { tone: "firm", idempotency_key: "reminder-1" },
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.status, "sent");

      const events = await send("GET", `/api/invoices/${invoiceId}/events`, { token });
      assert.equal(events.body.data[0].type, "reminder_sent");
    });
  });

  it("refuses to send a disputed invoice", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const user = await makeUser(tx);
      const customer = await makeCustomer(tx, ws, { name: "Blocked Co" });
      const invoiceId = await makeInvoice(tx, ws, customer, {
        amount: 10_000,
        status: "disputed",
        dueOffsetDays: 10,
      });

      const response = await send("POST", `/api/invoices/${invoiceId}/send`, {
        token: await tokenForUser(user, ws),
        body: { idempotency_key: "blocked-1" },
      });

      assert.equal(response.status, 409);
    });
  });

  it("answers 404 for another workspace's invoice", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const user = await makeUser(tx);
      const theirCustomer = await makeCustomer(tx, theirs, { name: "Other Co" });
      const theirInvoice = await makeInvoice(tx, theirs, theirCustomer, {
        amount: 10_000,
        dueOffsetDays: 10,
      });

      const response = await send("POST", `/api/invoices/${theirInvoice}/send`, {
        token: await tokenForUser(user, mine),
        body: { idempotency_key: "cross-tenant" },
      });

      assert.equal(response.status, 404);
    });
  });
});
