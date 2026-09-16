import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import postgres from "postgres";

const MIGRATIONS_DIR = path.join(import.meta.dirname, "../sql");

/**
 * Apply every `src/sql/*.sql` file that has not run yet, in filename order,
 * each in its own transaction.
 *
 * ponytail: a hand-rolled runner instead of a migration framework, because the
 * files are hand-written SQL and a framework would add a journal to keep in
 * step by hand. Switch if generated migrations ever outnumber written ones.
 */
export async function applyMigrations(connectionString) {
  const sql = postgres(connectionString, { max: 1, prepare: false });
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename    text        PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `;
    const applied = new Set(
      (await sql`SELECT filename FROM _migrations`).map((row) => row.filename),
    );
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    const ran = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const ddl = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(ddl);
        await tx`INSERT INTO _migrations (filename) VALUES (${file})`;
      });
      ran.push(file);
    }
    return ran;
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const ran = await applyMigrations(url);
  console.log(ran.length ? `applied: ${ran.join(", ")}` : "nothing to apply");
}
