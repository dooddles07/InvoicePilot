/**
 * services/automations.js's evaluateAutomation -- the daily sweep the cron
 * calls, not a route. Model-level, like reports-invariants.test.js: no HTTP,
 * just the function against a rolled-back transaction.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import * as automationsModel from "../src/models/automations.js";
import { insertEmailTemplates } from "../src/models/notifications.js";
import { evaluateAutomation } from "../src/services/automations.js";
import { sql, withRollback } from "./helpers/database.js";
import { makeCustomer, makeInvoice, makeWorkspace } from "./helpers/factories.js";
import { TEST_CONFIG } from "./helpers/app.js";

after(() => sql.end());

async function makeTestAutomation(tx, workspaceId, overrides = {}) {
  return automationsModel.createAutomation(tx, workspaceId, {
    name: "Test Automation",
    description: "",
    triggerLabel: "Invoice becomes overdue",
    triggerDays: 7,
    tone: "friendly",
    nodes: [],
    ...overrides,
  });
}

describe("evaluateAutomation", () => {
  it("sends a reminder to every invoice past the trigger threshold, under the automation's own name", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      await insertEmailTemplates(tx, ws);
      const customer = await makeCustomer(tx, ws, { name: "Overdue Co" });
      const invoiceId = await makeInvoice(tx, ws, customer, {
        amount: 10_000,
        status: "sent",
        dueOffsetDays: -10,
      });
      const automation = await makeTestAutomation(tx, ws);

      const result = await evaluateAutomation(tx, TEST_CONFIG, automation);

      assert.equal(result.matched, 1);
      assert.equal(result.sent, 1);

      const events = await tx`SELECT type, actor FROM collection_events WHERE invoice_id = ${invoiceId}`;
      assert.equal(events[0].type, "reminder_sent");
      assert.equal(events[0].actor, "Test Automation");
    });
  });

  it("does not match an invoice that has not reached the threshold yet", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      await insertEmailTemplates(tx, ws);
      const customer = await makeCustomer(tx, ws, { name: "Not Yet Co" });
      await makeInvoice(tx, ws, customer, { amount: 10_000, status: "sent", dueOffsetDays: -3 });
      const automation = await makeTestAutomation(tx, ws, { triggerDays: 7 });

      const result = await evaluateAutomation(tx, TEST_CONFIG, automation);
      assert.equal(result.matched, 0);
    });
  });

  it("skips an invoice contacted inside the three-day cooldown", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      await insertEmailTemplates(tx, ws);
      const customer = await makeCustomer(tx, ws, { name: "Recently Contacted Co" });
      const invoiceId = await makeInvoice(tx, ws, customer, {
        amount: 10_000,
        status: "sent",
        dueOffsetDays: -10,
      });
      await tx`UPDATE invoices SET last_contacted_at = now() - interval '1 day' WHERE id = ${invoiceId}`;
      const automation = await makeTestAutomation(tx, ws);

      const result = await evaluateAutomation(tx, TEST_CONFIG, automation);
      assert.equal(result.matched, 0);
      assert.equal(result.sent, 0);
    });
  });

  it("skips a disputed invoice even past the threshold", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      await insertEmailTemplates(tx, ws);
      const customer = await makeCustomer(tx, ws, { name: "Disputed Co" });
      await makeInvoice(tx, ws, customer, { amount: 10_000, status: "disputed", dueOffsetDays: -30 });
      const automation = await makeTestAutomation(tx, ws);

      const result = await evaluateAutomation(tx, TEST_CONFIG, automation);
      assert.equal(result.matched, 0);
    });
  });

  it("records a run, matched and sent both zero, even when nothing matched", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const automation = await makeTestAutomation(tx, ws);

      await evaluateAutomation(tx, TEST_CONFIG, automation);

      const runs = await automationsModel.listRuns(tx, ws, automation.id);
      assert.equal(runs.length, 1);
      assert.equal(runs[0].matched_count, 0);
      assert.equal(runs[0].sent_count, 0);
      assert.ok(runs[0].finished_at);
    });
  });

  it("does not touch another workspace's invoices", async () => {
    await withRollback(async (tx) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      await insertEmailTemplates(tx, theirs);
      const theirCustomer = await makeCustomer(tx, theirs, { name: "Other Co" });
      await makeInvoice(tx, theirs, theirCustomer, { amount: 50_000, status: "sent", dueOffsetDays: -30 });

      const automation = await makeTestAutomation(tx, mine);
      const result = await evaluateAutomation(tx, TEST_CONFIG, automation);

      assert.equal(result.matched, 0);
    });
  });
});
