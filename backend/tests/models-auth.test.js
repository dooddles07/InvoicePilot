import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import {
  findActiveMembership,
  findRefreshTokenByHash,
  findRefreshTokenById,
  findUserByEmail,
  findUserById,
  insertRefreshToken,
  insertUser,
  insertWorkspaceMember,
  revokeRefreshToken,
  setRefreshTokenReplacedBy,
} from "../src/models/auth.js";
import {
  REMINDER_TEMPLATES,
  insertEmailTemplates,
} from "../src/models/notifications.js";
import { findWorkspaceById, insertWorkspace } from "../src/models/workspaces.js";
import { sql, withRollback } from "./helpers/database.js";

after(() => sql.end());

function newUser(overrides = {}) {
  return {
    id: randomUUID(),
    email: `${randomUUID()}@example.test`,
    fullName: "Ada Lovelace",
    passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA",
    ...overrides,
  };
}

function newWorkspace(overrides = {}) {
  const id = randomUUID();
  return { id, name: "Ada's workspace", slug: `ada-${id.slice(0, 8)}`, ...overrides };
}

describe("users", () => {
  it("round trips by id and by email", async () => {
    await withRollback(async (tx) => {
      const input = newUser();
      const inserted = await insertUser(tx, input);

      assert.equal(inserted.email, input.email);
      assert.equal(inserted.full_name, "Ada Lovelace");
      assert.equal(inserted.avatar_url, null);
      assert.equal((await findUserById(tx, input.id)).id, input.id);
      assert.equal((await findUserByEmail(tx, input.email)).id, input.id);
    });
  });

  it("finds an email whatever its case", async () => {
    // uq_users_email_lower indexes LOWER(email), and login lower-cases before
    // it looks. A case-sensitive lookup here would let one address sign up
    // twice and then fail to log either of them in.
    await withRollback(async (tx) => {
      const input = newUser({ email: "Ada@Example.test" });
      await insertUser(tx, input);
      assert.ok(await findUserByEmail(tx, "ada@example.test"));
      assert.ok(await findUserByEmail(tx, "ADA@EXAMPLE.TEST"));
    });
  });

  it("answers undefined for an email nobody has", async () => {
    await withRollback(async (tx) => {
      assert.equal(await findUserByEmail(tx, "nobody@example.test"), undefined);
    });
  });
});

describe("memberships", () => {
  it("returns the workspace, its name and the role", async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx, newUser());
      const workspace = await insertWorkspace(tx, newWorkspace());
      await insertWorkspaceMember(tx, {
        id: randomUUID(),
        workspaceId: workspace.id,
        userId: user.id,
        role: "owner",
        status: "active",
      });

      const membership = await findActiveMembership(tx, user.id);
      assert.equal(membership.workspace_id, workspace.id);
      assert.equal(membership.workspace_name, "Ada's workspace");
      assert.equal(membership.role, "owner");
    });
  });

  it("ignores a membership that is only invited", async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx, newUser());
      const workspace = await insertWorkspace(tx, newWorkspace());
      await insertWorkspaceMember(tx, {
        id: randomUUID(),
        workspaceId: workspace.id,
        userId: user.id,
        role: "member",
        status: "invited",
      });
      assert.equal(await findActiveMembership(tx, user.id), undefined);
    });
  });

  it("prefers the oldest active membership", async () => {
    // A returning user lands in the workspace they think of as theirs, not
    // whichever one was created last.
    await withRollback(async (tx) => {
      const user = await insertUser(tx, newUser());
      const first = await insertWorkspace(tx, newWorkspace({ name: "First" }));
      const second = await insertWorkspace(tx, newWorkspace({ name: "Second" }));
      await insertWorkspaceMember(tx, {
        id: randomUUID(),
        workspaceId: first.id,
        userId: user.id,
        role: "owner",
        status: "active",
      });
      await tx`
        UPDATE workspace_members
        SET created_at = now() - interval '1 day'
        WHERE workspace_id = ${first.id}
      `;
      await insertWorkspaceMember(tx, {
        id: randomUUID(),
        workspaceId: second.id,
        userId: user.id,
        role: "viewer",
        status: "active",
      });

      assert.equal((await findActiveMembership(tx, user.id)).workspace_id, first.id);
    });
  });

  it("narrows to one workspace when asked for one", async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx, newUser());
      const first = await insertWorkspace(tx, newWorkspace());
      const second = await insertWorkspace(tx, newWorkspace({ name: "Client co" }));
      for (const [workspace, role] of [[first, "owner"], [second, "viewer"]]) {
        await insertWorkspaceMember(tx, {
          id: randomUUID(),
          workspaceId: workspace.id,
          userId: user.id,
          role,
          status: "active",
        });
      }

      const membership = await findActiveMembership(tx, user.id, second.id);
      // The role travels with the workspace: an owner elsewhere is a viewer here.
      assert.equal(membership.role, "viewer");
      assert.equal(
        await findActiveMembership(tx, user.id, randomUUID()),
        undefined,
      );
    });
  });
});

describe("refresh tokens", () => {
  async function seedToken(tx, overrides = {}) {
    const user = await insertUser(tx, newUser());
    const row = {
      id: randomUUID(),
      userId: user.id,
      tokenHash: randomUUID().replaceAll("-", "").repeat(2),
      expiresAt: new Date(Date.now() + 86_400_000),
      ...overrides,
    };
    await insertRefreshToken(tx, row);
    return row;
  }

  it("round trips by hash and by id", async () => {
    await withRollback(async (tx) => {
      const row = await seedToken(tx);
      const found = await findRefreshTokenByHash(tx, row.tokenHash);
      assert.equal(found.id, row.id);
      assert.equal(found.revoked_at, null);
      assert.equal(found.replaced_by_id, null);
      assert.ok(found.expires_at instanceof Date);
      assert.equal((await findRefreshTokenById(tx, row.id)).id, row.id);
    });
  });

  it("records a revocation and a replacement", async () => {
    await withRollback(async (tx) => {
      const older = await seedToken(tx);
      const newer = await seedToken(tx);
      const revokedAt = new Date();

      await revokeRefreshToken(tx, older.id, revokedAt);
      await setRefreshTokenReplacedBy(tx, older.id, newer.id);

      const row = await findRefreshTokenById(tx, older.id);
      assert.equal(row.revoked_at.getTime(), revokedAt.getTime());
      assert.equal(row.replaced_by_id, newer.id);
    });
  });

  it("answers undefined for a hash nobody issued", async () => {
    await withRollback(async (tx) => {
      assert.equal(await findRefreshTokenByHash(tx, "0".repeat(64)), undefined);
    });
  });
});

describe("email templates", () => {
  it("seeds the three tones a workspace starts with", async () => {
    await withRollback(async (tx) => {
      const workspace = await insertWorkspace(tx, newWorkspace());
      await insertEmailTemplates(tx, workspace.id);

      const rows = await tx`
        SELECT tone, subject FROM email_templates
        WHERE workspace_id = ${workspace.id} ORDER BY tone
      `;
      assert.deepEqual(
        rows.map((row) => row.tone),
        ["final", "firm", "friendly"],
      );
      assert.equal(rows.length, REMINDER_TEMPLATES.length);
      assert.ok(rows.every((row) => row.subject.includes("{invoice_number}")));
    });
  });
});

describe("workspaces", () => {
  it("round trips by id", async () => {
    await withRollback(async (tx) => {
      const workspace = await insertWorkspace(tx, newWorkspace());
      const found = await findWorkspaceById(tx, workspace.id);
      assert.equal(found.name, "Ada's workspace");
      assert.equal(await findWorkspaceById(tx, randomUUID()), undefined);
    });
  });
});
