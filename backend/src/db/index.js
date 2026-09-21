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
 * postgres.js parses a `date` column into a JS Date by default. Handing that
 * to res.json() serializes it through Date.prototype.toJSON(), which adds a
 * time and a "Z" -- a calendar date gains a timezone it never had, and every
 * consumer that formats issue_date/due_date/paid_date now has to reason about
 * one. Kept as the wire string instead: already exactly `YYYY-MM-DD`.
 */
const dateAsString = { to: 1082, from: [1082], serialize: (value) => value, parse: (value) => value };

/**
 * max: 5 because Render runs one long-lived process, not a serverless function,
 * so it should hold a small pool. prepare: false because Neon's pooled endpoint
 * runs PgBouncer in transaction mode, which rejects prepared statements.
 */
export function createClient(connectionString) {
  return postgres(connectionString, {
    max: 5,
    prepare: false,
    types: { bigint: bigintAsNumber, date: dateAsString },
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

/**
 * Run `fn` in a transaction -- or in a savepoint, when the handle already is
 * one.
 *
 * postgres.js gives a transaction callback a handle carrying .savepoint and no
 * .begin (src/index.js:250-253), so a controller that called sql.begin would
 * throw the moment a test handed it the rollback transaction. One line here is
 * what lets the controller read the same either way.
 */
export function transaction(sql, fn) {
  return sql.begin ? sql.begin(fn) : sql.savepoint(fn);
}
