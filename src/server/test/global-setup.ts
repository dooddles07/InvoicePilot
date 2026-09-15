import postgres from "postgres";

import { applyMigrations } from "../../../scripts/migrate";
import { assertTestDatabase } from "./database";

/**
 * Rebuild the schema once per run, then migrate.
 *
 * Equivalent to the Python suite's `downgrade base` followed by `upgrade
 * head`: a stale column from an edited migration is a confusing test failure,
 * and a fresh schema costs under a second locally.
 */
export async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  assertTestDatabase(url);

  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  } finally {
    await sql.end();
  }
  await applyMigrations(url);
}
