/**
 * GET/POST /api/api-keys, DELETE /api/api-keys/:keyId.
 *
 * Also the one place that exercises the authenticate middleware's second
 * credential shape end to end: a key this suite creates is used as a real
 * bearer token against a normal route.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { issueAccessToken, makePrincipal } from "../src/lib/security.js";
import { sql } from "./helpers/database.js";
import { makeCustomer, makeInvoice, makeWorkspace } from "./helpers/factories.js";
import { TEST_CONFIG, withApp } from "./helpers/app.js";

after(() => sql.end());

async function tokenFor(workspaceId, role = "owner") {
  return issueAccessToken(
    makePrincipal(randomUUID(), workspaceId, role),
    TEST_CONFIG.secretKey,
  );
}

describe("POST /api/api-keys", () => {
  it("returns the full key once, with only the last four kept on the row", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const response = await send("POST", "/api/api-keys", {
        token: await tokenFor(ws),
        body: { name: "Staging sandbox", scopes: ["read", "write"] },
      });

      assert.equal(response.status, 201);
      assert.match(response.body.key, /^ip_live_/);
      assert.equal(response.body.last_four, response.body.key.slice(-4));
      assert.equal(response.body.name, "Staging sandbox");
    });
  });

  it("refuses a member -- apikey:write is admin and owner only", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const response = await send("POST", "/api/api-keys", {
        token: await tokenFor(ws, "member"),
        body: { name: "x", scopes: ["read"] },
      });
      assert.equal(response.status, 403);
    });
  });
});

describe("GET /api/api-keys", () => {
  it("never returns the plaintext key", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const token = await tokenFor(ws);
      await send("POST", "/api/api-keys", { token, body: { name: "k", scopes: ["read"] } });

      const response = await send("GET", "/api/api-keys", { token });

      assert.equal(response.body.data.length, 1);
      assert.equal(response.body.data[0].key, undefined);
      assert.equal(response.body.data[0].last_four.length, 4);
    });
  });

  it("does not return another workspace's keys", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      await send("POST", "/api/api-keys", {
        token: await tokenFor(theirs),
        body: { name: "theirs", scopes: ["read"] },
      });

      const response = await send("GET", "/api/api-keys", { token: await tokenFor(mine) });
      assert.deepEqual(response.body.data, []);
    });
  });
});

describe("DELETE /api/api-keys/:keyId", () => {
  it("revokes the key, and a revoked key stops authenticating", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Key Co" });
      await makeInvoice(tx, ws, customer, { amount: 10_000, dueOffsetDays: 10 });
      const token = await tokenFor(ws);

      const created = await send("POST", "/api/api-keys", {
        token,
        body: { name: "revoke me", scopes: ["read"] },
      });
      const key = created.body.key;

      // The new key authenticates a real route before it is revoked.
      const before = await send("GET", "/api/invoices", { token: key });
      assert.equal(before.status, 200);
      assert.equal(before.body.data.length, 1);

      const revoke = await send("DELETE", `/api/api-keys/${created.body.id}`, { token });
      assert.equal(revoke.status, 204);

      const after1 = await send("GET", "/api/invoices", { token: key });
      assert.equal(after1.status, 401);
    });
  });

  it("answers 404 for a key in another workspace", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const created = await send("POST", "/api/api-keys", {
        token: await tokenFor(theirs),
        body: { name: "theirs", scopes: ["read"] },
      });

      const response = await send("DELETE", `/api/api-keys/${created.body.id}`, {
        token: await tokenFor(mine),
      });
      assert.equal(response.status, 404);
    });
  });
});

describe("a read-scoped key", () => {
  it("cannot write -- scope maps to viewer, not member", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Read Only Co" });
      const invoiceId = await makeInvoice(tx, ws, customer, { amount: 10_000, dueOffsetDays: 10 });
      const created = await send("POST", "/api/api-keys", {
        token: await tokenFor(ws),
        body: { name: "read only", scopes: ["read"] },
      });

      const response = await send("POST", "/api/payments", {
        token: created.body.key,
        body: { invoice_id: invoiceId, amount_cents: 1_000, method: "card", received_at: "2026-01-01" },
      });
      assert.equal(response.status, 403);
    });
  });
});
