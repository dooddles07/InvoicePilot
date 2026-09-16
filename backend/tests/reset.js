import postgres from "postgres";

import { applyMigrations } from "../src/db/migrate.js";
import { assertTestDatabase } from "./helpers/database.js";

/**
 * Rebuild the schema once per run, then migrate. Run by the `pretest` script,
 * so it happens before any test file starts.
 *
 * Equivalent to the Python suite's `downgrade base` followed by `upgrade head`:
 * a stale column from an edited migration is a confusing test failure, and a
 * fresh schema costs under a second locally.
 *
 * The filename does not match the runner's test-file patterns, so `node --test
 * tests/*.test.js` never executes it as a suite.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
assertTestDatabase(url);

const sql = postgres(url, { max: 1, prepare: false });
try {
  await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
} finally {
  await sql.end();
}

const applied = await applyMigrations(url);
console.log(`reset: applied ${applied.join(", ")}`);
