import postgres from "postgres";

/**
 * postgres.js returns int8 as a string, because a bigint does not always fit a
 * JavaScript number. Every money column in this schema is int8 --
 * amount_cents, paid_cents, balance_cents -- so choosing per query is how one
 * screen ends up formatting "120000" as a string. Decided once, here.
 *
 * The range check is what makes it safe: cents overflow Number only past
 * ninety trillion dollars, and a value that large is a bug worth throwing on.
 */
export const bigintAsNumber = {
  to: 20,
  from: [20],
  serialize: (value) => String(value),
  parse: (value) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`bigint ${value} does not fit a JavaScript number`);
    }
    return parsed;
  },
};

/**
 * max: 5 because Render runs one long-lived process, not a serverless function,
 * so it should hold a small pool. prepare: false because Neon's pooled endpoint
 * runs PgBouncer in transaction mode, which rejects prepared statements.
 */
export function createClient(connectionString) {
  return postgres(connectionString, {
    max: 5,
    prepare: false,
    types: { bigint: bigintAsNumber },
  });
}

let client;

/**
 * Built on first use, not at import. Importing a model then loads no driver and
 * parses no connection URL, so a test or a CLI command can import one without a
 * database. Ported from the same reasoning in app/api/deps.py.
 */
export function getSql(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  client ??= createClient(connectionString);
  return client;
}
