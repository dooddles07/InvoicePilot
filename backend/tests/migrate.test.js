import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import postgres from "postgres";

import { applyMigrations } from "../src/db/migrate.js";
import { testConnectionString } from "./helpers/database.js";

// Each test file runs in its own process, so each closes its own client.
// Leaving it open keeps the event loop alive and the runner hangs.
const sql = postgres(testConnectionString(), { max: 1, prepare: false });
after(() => sql.end());

describe("applyMigrations", () => {
  it("has recorded both migration files", async () => {
    const rows = await sql`SELECT filename FROM _migrations ORDER BY filename`;
    assert.deepEqual(
      rows.map((row) => row.filename),
      ["0000_schema.sql", "0001_derivation_views.sql"],
    );
  });

  it("creates the three derivation views", async () => {
    const rows = await sql`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    assert.deepEqual(
      rows.map((row) => row.table_name),
      ["collection_queue", "customer_stats", "invoice_state"],
    );
  });

  it("applies nothing on a second run", async () => {
    // Idempotence is what makes it safe to run at boot on every deploy.
    assert.deepEqual(await applyMigrations(testConnectionString()), []);
  });
});
