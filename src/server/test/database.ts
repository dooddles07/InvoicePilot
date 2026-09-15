import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { expect } from "vitest";

/**
 * Refuse to run against anything not obviously a test database.
 *
 * The suite drops the public schema before migrating. Aimed at a development
 * database that is irreversible data loss, and the mistake is one stale
 * environment variable away.
 */
export function assertTestDatabase(url: string): void {
  const name = url.split("?")[0].split("/").pop() ?? "";
  if (!name.toLowerCase().includes("test")) {
    throw new Error(
      `${JSON.stringify(name)} does not look like a test database. ` +
        "Point DATABASE_URL at one whose name contains 'test'.",
    );
  }
}

export function testConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  assertTestDatabase(url);
  return url;
}

const client = postgres(testConnectionString(), { max: 1, prepare: false });
export const testDb = drizzle(client);

/**
 * The transaction handle Drizzle hands a `transaction()` callback.
 *
 * Derived rather than imported: the concrete type is a `PgTransaction`
 * specialised by driver, and naming it by hand is a type that drifts when the
 * driver changes.
 */
export type Tx = Parameters<Parameters<typeof testDb.transaction>[0]>[0];

class Rollback extends Error {}

/**
 * Run `fn` inside a transaction that is discarded when it returns.
 *
 * Tests may write freely; nothing survives. The alternative -- a database per
 * test -- costs seconds per test against a network Postgres.
 */
export async function withRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  let result!: T;
  try {
    await testDb.transaction(async (tx) => {
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
 * Drizzle wraps every driver error in a `DrizzleQueryError` whose own
 * `.message` is just "Failed query: <sql>" -- the Postgres error naming the
 * constraint is one level down, on `.cause`.
 */
export async function expectConstraintViolation(
  promise: Promise<unknown>,
  constraint: string,
): Promise<void> {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    const cause = error instanceof Error ? error.cause : undefined;
    const message = cause instanceof Error ? cause.message : String(error);
    return message.includes(constraint);
  });
}
