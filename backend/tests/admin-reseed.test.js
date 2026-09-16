/**
 * The one endpoint in this service that deletes data.
 *
 * Its guards are the whole test: a wrong token, an absent token and an
 * unconfigured service all answer 401 before a single row is read, and the
 * workspace it rebuilds is the one in configuration whatever the request says.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { seedDemoWorkspace } from "../src/db/seed.js";
import { insertUser } from "../src/models/auth.js";
import { deleteWorkspaceData } from "../src/models/workspaces.js";
import { TEST_CONFIG, withApp } from "./helpers/app.js";
import { sql, withRollback } from "./helpers/database.js";

after(() => sql.end());

const ADMIN_TOKEN = "a".repeat(32);
const DEMO_WORKSPACE_ID = "3f1d2c80-0000-4000-8000-000000000001";

const configWith = (overrides) => ({
  ...TEST_CONFIG,
  adminToken: ADMIN_TOKEN,
  demoWorkspaceId: DEMO_WORKSPACE_ID,
  ...overrides,
});

async function makeDemoUser(tx) {
  const user = await insertUser(tx, {
    id: randomUUID(),
    email: `demo-${randomUUID()}@example.test`,
    fullName: "Alex Mercer",
    passwordHash: "argon2-placeholder",
  });
  return user.id;
}

describe("POST /api/admin/reseed", () => {
  it("refuses a request with no token", async () => {
    await withApp(async ({ send }) => {
      const response = await send("POST", "/api/admin/reseed");
      assert.equal(response.status, 401);
      assert.equal(response.body.detail, "Invalid credentials");
    }, configWith({}));
  });

  it("refuses a wrong token", async () => {
    await withApp(async ({ send }) => {
      const response = await send("POST", "/api/admin/reseed", {
        headers: { "X-Admin-Token": "b".repeat(32) },
      });
      assert.equal(response.status, 401);
    }, configWith({}));
  });

  it("refuses a token of a different length", async () => {
    // timingSafeEqual throws on unequal lengths; the guard must answer 401,
    // not 500.
    await withApp(async ({ send }) => {
      const response = await send("POST", "/api/admin/reseed", {
        headers: { "X-Admin-Token": "a".repeat(8) },
      });
      assert.equal(response.status, 401);
    }, configWith({}));
  });

  it("refuses everything when the service has no admin token", async () => {
    await withApp(async ({ send }) => {
      const response = await send("POST", "/api/admin/reseed", {
        headers: { "X-Admin-Token": ADMIN_TOKEN },
      });
      assert.equal(response.status, 401);
    }, configWith({ adminToken: null }));
  });

  it("answers 404 when the demo workspace has not been seeded", async () => {
    await withApp(async ({ send }) => {
      const response = await send("POST", "/api/admin/reseed", {
        headers: { "X-Admin-Token": ADMIN_TOKEN },
      });
      assert.equal(response.status, 404);
    }, configWith({}));
  });

  it("rebuilds the demo workspace and keeps its id, slug and member", async () => {
    await withApp(async ({ send, tx }) => {
      const userId = await makeDemoUser(tx);
      await seedDemoWorkspace(tx, {
        workspaceId: DEMO_WORKSPACE_ID,
        ownerUserId: userId,
      });
      const [before] = await tx`
        SELECT slug FROM workspaces WHERE id = ${DEMO_WORKSPACE_ID}
      `;
      const [firstInvoice] = await tx`
        SELECT id FROM invoices WHERE workspace_id = ${DEMO_WORKSPACE_ID} LIMIT 1
      `;

      const response = await send("POST", "/api/admin/reseed", {
        headers: { "X-Admin-Token": ADMIN_TOKEN },
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.workspace_id, DEMO_WORKSPACE_ID);
      assert.equal(response.body.invoices, 460);

      const [after_] = await tx`
        SELECT slug FROM workspaces WHERE id = ${DEMO_WORKSPACE_ID}
      `;
      assert.equal(after_.slug, before.slug);

      // The rows are new ones, not the old ones left in place.
      const [survivor] = await tx`
        SELECT id FROM invoices WHERE id = ${firstInvoice.id}
      `;
      assert.equal(survivor, undefined);

      const [member] = await tx`
        SELECT user_id, role FROM workspace_members
        WHERE workspace_id = ${DEMO_WORKSPACE_ID}
      `;
      assert.equal(member.user_id, userId);
      assert.equal(member.role, "admin");

      // The user row survives, so the demo password survives with it.
      const [user] = await tx`SELECT id FROM users WHERE id = ${userId}`;
      assert.ok(user);
    }, configWith({}));
  });

  it("touches no other workspace, whatever the body asks for", async () => {
    await withApp(async ({ send, tx }) => {
      const demoUser = await makeDemoUser(tx);
      await seedDemoWorkspace(tx, {
        workspaceId: DEMO_WORKSPACE_ID,
        ownerUserId: demoUser,
      });

      const otherUser = await makeDemoUser(tx);
      const otherId = randomUUID();
      await seedDemoWorkspace(tx, { workspaceId: otherId, ownerUserId: otherUser });

      const response = await send("POST", "/api/admin/reseed", {
        headers: { "X-Admin-Token": ADMIN_TOKEN },
        body: { workspace_id: otherId },
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.workspace_id, DEMO_WORKSPACE_ID);

      const [row] = await tx`
        SELECT COUNT(*)::int AS count FROM invoices WHERE workspace_id = ${otherId}
      `;
      assert.equal(row.count, 460);
    }, configWith({}));
  });

  it("is repeatable: the ledger does not double", async () => {
    await withApp(async ({ send, tx }) => {
      const userId = await makeDemoUser(tx);
      await seedDemoWorkspace(tx, {
        workspaceId: DEMO_WORKSPACE_ID,
        ownerUserId: userId,
      });

      await send("POST", "/api/admin/reseed", {
        headers: { "X-Admin-Token": ADMIN_TOKEN },
      });
      await send("POST", "/api/admin/reseed", {
        headers: { "X-Admin-Token": ADMIN_TOKEN },
      });

      const [row] = await tx`
        SELECT COUNT(*)::int AS count FROM invoices
        WHERE workspace_id = ${DEMO_WORKSPACE_ID}
      `;
      assert.equal(row.count, 460);
    }, configWith({}));
  });
});

describe("deleteWorkspaceData", () => {
  it("leaves a neighbouring workspace's rows alone", async () => {
    await withRollback(async (tx) => {
      const keeperUser = await makeDemoUser(tx);
      const keeper = randomUUID();
      await seedDemoWorkspace(tx, { workspaceId: keeper, ownerUserId: keeperUser });

      const doomedUser = await makeDemoUser(tx);
      const doomed = randomUUID();
      await seedDemoWorkspace(tx, { workspaceId: doomed, ownerUserId: doomedUser });

      await deleteWorkspaceData(tx, doomed);

      const [gone] = await tx`SELECT id FROM workspaces WHERE id = ${doomed}`;
      assert.equal(gone, undefined);
      const [left] = await tx`
        SELECT COUNT(*)::int AS count FROM invoices WHERE workspace_id = ${doomed}
      `;
      assert.equal(left.count, 0);
      const [kept] = await tx`
        SELECT COUNT(*)::int AS count FROM invoices WHERE workspace_id = ${keeper}
      `;
      assert.equal(kept.count, 460);
    });
  });
});
