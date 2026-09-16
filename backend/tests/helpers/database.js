import assert from "node:assert/strict";

import { createClient } from "../../src/db/index.js";

/**
 * Refuse to run against anything not obviously a test database.
 *
 * The suite drops the public schema before migrating. Aimed at a development
 * database that is irreversible data loss, and the mistake is one stale
 * environment variable away.
 */
export function assertTestDatabase(url) {
  const name = url.split("?")[0].split("/").pop() ?? "";
  if (!name.toLowerCase().includes("test")) {
    throw new Error(
      `${JSON.stringify(name)} does not look like a test database. ` +
        "Point DATABASE_URL at one whose name contains 'test'.",
    );
  }
}

export function testConnectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  assertTestDatabase(url);
  return url;
}

export const sql = createClient(testConnectionString());

class Rollback extends Error {}

/**
 * Run `fn` inside a transaction that is discarded when it returns.
 *
 * Tests may write freely; nothing survives. The alternative -- a database per
 * test -- costs seconds per test against a network Postgres.
 *
 * The sentinel is how the rollback is requested: postgres.js commits when the
 * callback returns and rolls back when it throws, so a thrown marker is the
 * only way to end a successful test without a commit.
 */
export async function withRollback(fn) {
  let result;
  try {
    await sql.begin(async (tx) => {
      result = await fn(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  return result;
}

/**
 * Assert a promise rejects because of a specific named constraint.
 *
 * postgres.js puts the constraint on the error itself, so this reads it
 * directly. Matching the message instead would also pass for a typo in the
 * test's own SQL that happened to mention the name.
 *
 * A failed statement aborts its transaction, so a call to this must be the last
 * statement inside its withRollback block.
 */
export async function expectConstraintViolation(promise, constraint) {
  try {
    await promise;
  } catch (error) {
    assert.equal(
      error.constraint_name,
      constraint,
      `expected a ${constraint} violation, got ${error.constraint_name ?? error.message}`,
    );
    return;
  }
  assert.fail(`expected a ${constraint} violation, but the statement succeeded`);
}
