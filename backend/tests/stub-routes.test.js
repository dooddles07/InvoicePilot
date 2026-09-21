/**
 * The complete endpoint inventory, real and not-implemented alike.
 *
 * ENDPOINTS is frozen: it grows only when a route is mounted, never shrinks,
 * and drives the guard-coverage and permission-parity checks below regardless
 * of whether a route is real. NOT_IMPLEMENTED is the live subset that still
 * answers 501 -- it shrinks by exactly what each phase of the fixtures-to-API
 * conversion implements, so "how much of this app is still fake" is a tested
 * number instead of a comment.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { createApp } from "../src/app.js";
import { ROLE_PERMISSIONS, issueAccessToken, makePrincipal } from "../src/lib/security.js";
import { TEST_CONFIG } from "./helpers/app.js";

const DETAIL = "Not implemented: the service layer for this route is not wired yet.";

// method, path, and the permission the route is guarded by: null for a route
// that needs only a bearer token, "anonymous" for one guarded by nothing.
const ENDPOINTS = [
  ["POST", "/api/auth/signup", "anonymous"],
  ["POST", "/api/auth/login", "anonymous"],
  ["POST", "/api/auth/refresh", "anonymous"],
  ["POST", "/api/auth/logout", "anonymous"],
  ["POST", "/api/auth/switch-workspace", null],
  ["POST", "/api/auth/password-reset", "anonymous"],

  ["GET", "/api/users/me", null],
  ["PATCH", "/api/users/me", null],

  ["GET", "/api/workspaces", null],
  ["POST", "/api/workspaces", null],
  ["GET", "/api/workspaces/ws-1", null],
  ["PATCH", "/api/workspaces/ws-1", "workspace:write"],
  ["GET", "/api/workspaces/ws-1/members", "team:write"],
  ["POST", "/api/workspaces/ws-1/members", "team:write"],

  ["GET", "/api/customers", "customer:read"],
  ["POST", "/api/customers", "customer:write"],
  ["GET", "/api/customers/c-1", "customer:read"],
  ["PATCH", "/api/customers/c-1", "customer:write"],
  ["GET", "/api/customers/c-1/behaviour", "customer:read"],
  ["GET", "/api/customers/c-1/events", "customer:read"],

  ["GET", "/api/invoices", "invoice:read"],
  ["POST", "/api/invoices", "invoice:write"],
  ["GET", "/api/invoices/i-1", "invoice:read"],
  ["PATCH", "/api/invoices/i-1", "invoice:write"],
  ["POST", "/api/invoices/i-1/send", "invoice:write"],
  ["GET", "/api/invoices/i-1/events", "invoice:read"],

  ["GET", "/api/payments", "payment:read"],
  ["POST", "/api/payments", "payment:write"],

  ["GET", "/api/collections/pipeline", "invoice:read"],
  ["GET", "/api/collections/queue", "invoice:read"],
  ["GET", "/api/collections/insights", "invoice:read"],
  ["GET", "/api/collections/summary", "invoice:read"],
  ["POST", "/api/collections/reminders", "invoice:write"],

  ["GET", "/api/automations", "automation:read"],
  ["POST", "/api/automations", "automation:write"],
  ["GET", "/api/automations/a-1", "automation:read"],
  ["PATCH", "/api/automations/a-1", "automation:write"],
  ["GET", "/api/automations/a-1/runs", "automation:read"],

  ["GET", "/api/notifications", null],
  ["POST", "/api/notifications/read", null],
  ["GET", "/api/notifications/preferences", null],
  ["PUT", "/api/notifications/preferences", null],
  ["GET", "/api/notifications/templates", "invoice:read"],

  ["GET", "/api/reports/summary", "report:read"],
  ["GET", "/api/reports/aging", "report:read"],
  ["GET", "/api/reports/cash-flow", "report:read"],
  ["GET", "/api/reports/collection-rate", "report:read"],
  ["GET", "/api/reports/customer-risk", "report:read"],
  ["GET", "/api/reports/days-to-payment", "report:read"],

  ["GET", "/api/integrations", "integration:read"],
  ["POST", "/api/integrations/stripe/connect", "integration:write"],
  ["DELETE", "/api/integrations/stripe", "integration:write"],
  ["POST", "/api/integrations/stripe/sync", "integration:write"],

  ["POST", "/api/ai/analyze", "report:read"],
  ["POST", "/api/ai/draft-reminder", "invoice:read"],
  ["POST", "/api/ai/ask", "report:read"],

  ["GET", "/api/billing/subscription", null],
  ["POST", "/api/billing/subscription", "billing:write"],
  ["GET", "/api/billing/invoices", null],

  ["GET", "/api/audit", "audit:read"],
];

function key(method, path) {
  return `${method} ${path}`;
}

// Endpoints not in this set are real; their behaviour is asserted by their
// own route test file, not here. Every phase of the fixtures-to-API
// conversion adds to it as a domain's controller stops re-exporting the stub
// handler.
const REAL = new Set([
  key("POST", "/api/auth/signup"),
  key("POST", "/api/auth/login"),
  key("POST", "/api/auth/refresh"),
  key("POST", "/api/auth/logout"),
  key("POST", "/api/auth/switch-workspace"),
  key("GET", "/api/users/me"),

  // invoices-routes.test.js
  key("GET", "/api/invoices"),
  key("POST", "/api/invoices"),
  key("GET", "/api/invoices/i-1"),
  key("PATCH", "/api/invoices/i-1"),
  key("POST", "/api/invoices/i-1/send"),
  key("GET", "/api/invoices/i-1/events"),

  // customers-routes.test.js
  key("GET", "/api/customers"),
  key("GET", "/api/customers/c-1"),
  key("GET", "/api/customers/c-1/behaviour"),
  key("GET", "/api/customers/c-1/events"),

  // payments-routes.test.js
  key("GET", "/api/payments"),
  key("POST", "/api/payments"),

  // collections-routes.test.js
  key("GET", "/api/collections/pipeline"),
  key("GET", "/api/collections/queue"),
  key("GET", "/api/collections/insights"),
  key("GET", "/api/collections/summary"),
  key("POST", "/api/collections/reminders"),

  // reports-routes.test.js
  key("GET", "/api/reports/summary"),
  key("GET", "/api/reports/aging"),
  key("GET", "/api/reports/cash-flow"),

  // workspaces-routes.test.js
  key("GET", "/api/workspaces/ws-1/members"),

  // notifications-routes.test.js
  key("GET", "/api/notifications/templates"),

  // ai-routes.test.js
  key("POST", "/api/ai/ask"),

  // audit-routes.test.js
  key("GET", "/api/audit"),
]);

const NOT_IMPLEMENTED = new Set(
  ENDPOINTS.filter(([method, path]) => !REAL.has(key(method, path))).map(
    ([method, path]) => key(method, path),
  ),
);

let server;
let origin;

before(async () => {
  server = createApp(TEST_CONFIG, null).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

async function tokenFor(role) {
  return issueAccessToken(
    makePrincipal(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      role,
    ),
    TEST_CONFIG.secretKey,
  );
}

function send(method, path, token) {
  return fetch(`${origin}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: ["POST", "PATCH", "PUT"].includes(method) ? "{}" : undefined,
  });
}

const stubs = ENDPOINTS.filter(([method, path]) => NOT_IMPLEMENTED.has(key(method, path)));

describe("the endpoint inventory", () => {
  it("is 60 endpoints -- the spec's 55 plus five the port added", () => {
    assert.equal(ENDPOINTS.length, 60);
  });

  it("tracks exactly the endpoints still not implemented", () => {
    assert.equal(NOT_IMPLEMENTED.size, 30);
  });
});

describe("with no credentials", () => {
  for (const [method, path, permission] of stubs) {
    const expected = permission === "anonymous" ? 501 : 401;
    it(`${method} ${path} answers ${expected}`, async () => {
      const response = await send(method, path, null);
      assert.equal(response.status, expected);
    });
  }
});

describe("as an owner", () => {
  for (const [method, path] of stubs) {
    it(`${method} ${path} answers 501`, async () => {
      const response = await send(method, path, await tokenFor("owner"));
      assert.equal(response.status, 501);
      const body = await response.json();
      assert.equal(
        body.detail,
        path.endsWith("/password-reset")
          ? "Not implemented: password reset needs the outbox from plan 4."
          : DETAIL,
      );
    });
  }
});

describe("as a viewer", () => {
  for (const [method, path, permission] of stubs) {
    const granted =
      permission === "anonymous" ||
      permission === null ||
      ROLE_PERMISSIONS.viewer.includes(permission);
    const expected = granted ? 501 : 403;

    it(`${method} ${path} answers ${expected}`, async () => {
      const response = await send(method, path, await tokenFor("viewer"));
      assert.equal(response.status, expected);
      if (!granted) {
        assert.equal((await response.json()).detail, `Requires ${permission}`);
      }
    });
  }
});

describe("the guards the routers actually mount", () => {
  it("name only permissions a role can hold", () => {
    // The reverse of the matrix test: a route guarded by a string that appears
    // in no grant list is a permanent 403 nobody can grant away.
    const directory = join(import.meta.dirname, "..", "src", "routes");
    const guarded = new Set();
    for (const file of readdirSync(directory)) {
      const source = readFileSync(join(directory, file), "utf8");
      for (const [, permission] of source.matchAll(
        /requirePermission\("([^"]+)"\)/g,
      )) {
        guarded.add(permission);
      }
    }

    const grantable = new Set(Object.values(ROLE_PERMISSIONS).flat());
    const ungrantable = [...guarded].filter(
      (permission) => !grantable.has(permission),
    );
    // billing:write is the known wart: no role enumerates it, so only owner
    // reaches it through the wildcard. It is grantable, and it is listed here
    // because the assertion below would otherwise hide a real typo.
    assert.deepEqual(ungrantable, ["billing:write"]);
  });

  it("guards every permission the routers claim to, and no more", () => {
    const directory = join(import.meta.dirname, "..", "src", "routes");
    const guarded = new Set();
    for (const file of readdirSync(directory)) {
      for (const [, permission] of readFileSync(
        join(directory, file),
        "utf8",
      ).matchAll(/requirePermission\("([^"]+)"\)/g)) {
        guarded.add(permission);
      }
    }
    const fromTable = new Set(
      ENDPOINTS.map(([, , permission]) => permission).filter(
        (permission) => permission && permission !== "anonymous",
      ),
    );
    assert.deepEqual([...guarded].sort(), [...fromTable].sort());
  });
});
