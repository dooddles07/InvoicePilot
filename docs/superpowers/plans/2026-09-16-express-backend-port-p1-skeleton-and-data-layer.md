# Express Backend Port P1 — Skeleton and Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a JavaScript Express backend in `backend/` with its configuration, database client, migration runner, error middleware and health endpoint, and re-establish the schema and derivation-view test coverage that the deleted TypeScript layer provided.

**Architecture:** `backend/` becomes a self-contained Node package with its own `package.json`, dependencies and lockfile, deployed separately from the Next frontend. The schema stays hand-written SQL, moved from `drizzle/` unchanged, applied by a small runner that records applied filenames in a `_migrations` table. Data access is postgres.js tagged templates with no ORM, so the derivation views keep defining every derived value. Tests use the Node built-in test runner against a real Postgres, each test inside a transaction that is always rolled back.

**Tech Stack:** Node 22, JavaScript (ESM), Express 5, `postgres` (postgres.js), `node:test`, `node:assert/strict`, PostgreSQL 16+.

**Spec:** `docs/superpowers/specs/2026-09-15-express-backend-port-design.md`

## Global Constraints

- JavaScript only under `backend/`. No TypeScript, no `.ts` files, no build step. `"type": "module"` — ESM everywhere, no `require`.
- Node 22. `node --test` is the test runner; Vitest is not a dependency of this package.
- Money is integer minor units: `amount_cents`, `paid_cents`, `balance_cents` are `bigint`. Never `float`, never `numeric`, never a formatted string.
- Every tenant table carries `workspace_id` with an index that leads on it.
- The database client is configured `max: 5`, `prepare: false`. Neon's pooled endpoint runs PgBouncer in transaction mode, which rejects prepared statements.
- Tests require `DATABASE_URL` to point at a database whose name contains `test`. The suite drops and recreates the `public` schema on every run.
- No module reads the environment or opens a connection at import time. Configuration and the client are built on first use.
- Commit messages: Conventional Commits, no AI attribution trailer.

## Scope

**In P1:** the `backend/` package, `config.js`, the database client and its bigint policy, the migration runner, the two SQL files moved across, the error middleware, `app.js`, `server.js`, `GET /health`, 14 model stubs, the test harness, and the ported schema and derivation-view suites.

**Not in P1:** `lib/security.js`, the auth service, any router or controller, the seeder, deleting the Python backend. `backend/app/` stays in the tree and still runs.

**Deviation from spec §13, deliberate:** the CI workflow is switched in P1, not P3. P1 deletes the root `test` script that `.github/workflows/ci.yml` invokes, so leaving CI until P3 means two phases of a red pipeline.

## File Structure

```
backend/
├── package.json              new: own dependencies and lockfile
├── .gitignore                modified: node_modules
├── .env.example              new: DATABASE_URL, SECRET_KEY, PORT
├── src/
│   ├── server.js             loads config, migrates, listens
│   ├── app.js                createApp(config): express app
│   ├── config.js             loadConfig(env): pure, throws on bad input
│   ├── db/
│   │   ├── index.js          createClient, getSql, bigint policy
│   │   └── migrate.js        applyMigrations, and a CLI entry
│   ├── sql/
│   │   ├── 0000_schema.sql   moved from drizzle/, unchanged
│   │   └── 0001_derivation_views.sql
│   ├── middleware/
│   │   └── errors.js         DomainError hierarchy, errorHandler
│   └── models/               14 stubs, one per domain
└── tests/
    ├── reset.js              drops the public schema, then migrates
    ├── helpers/
    │   ├── database.js       assertTestDatabase, withRollback, constraint assertion
    │   └── factories.js      makeWorkspace, makeCustomer, makeInvoice
    ├── config.test.js
    ├── database.test.js
    ├── migrate.test.js
    ├── db.test.js
    ├── schema.test.js
    ├── views-invoice-state.test.js
    ├── views-customer-stats.test.js
    ├── views-collection-queue.test.js
    ├── errors.test.js
    └── health.test.js
```

Root loses `src/server/`, `drizzle/`, `scripts/`, `drizzle.config.ts` and `vitest.config.mts` in Task 10.

---

### Task 1: The backend package and its configuration

**Files:**
- Create: `backend/package.json`
- Create: `backend/.env.example`
- Modify: `backend/.gitignore`
- Create: `backend/src/config.js`
- Test: `backend/tests/config.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `loadConfig(env = process.env)` — returns `{ environment: string, port: number, databaseUrl: string, secretKey: string }`. Throws `Error` when `DATABASE_URL` is missing, when `SECRET_KEY` is missing, or when `SECRET_KEY` is shorter than 32 characters.

- [ ] **Step 1: Create the package manifest**

Create `backend/package.json`:

```json
{
  "name": "invoicepilot-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "start": "node src/server.js",
    "migrate": "node src/db/migrate.js",
    "pretest": "node tests/reset.js",
    "test": "node --test --test-concurrency=1 tests/*.test.js"
  },
  "dependencies": {
    "express": "^5.1.0",
    "postgres": "^3.4.9"
  }
}
```

`--test-concurrency=1` because every test file shares one migrated database. Files that race to write the same tables produce failures that depend on machine core count.

- [ ] **Step 2: Install the dependencies**

Run from `backend/`:

```bash
npm install
```

Expected: `node_modules/` and `package-lock.json` appear under `backend/`.

- [ ] **Step 3: Ignore the installed dependencies**

Append to `backend/.gitignore`:

```gitignore
node_modules/
```

- [ ] **Step 4: Document the environment**

Create `backend/.env.example`:

```bash
# Application database. On Render this is Neon's POOLED connection string.
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/invoicepilot"

# Tests drop and recreate the public schema, so the database name must contain
# "test". The suite refuses to run against anything else.
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/invoicepilot_test"

# HS256 signing key for access tokens. At least 32 characters; no default.
SECRET_KEY="replace-me-with-at-least-thirty-two-characters"

# Render sets PORT itself. 3001 locally, so it does not collide with Next.
PORT=3001
```

- [ ] **Step 5: Write the failing test**

Create `backend/tests/config.test.js`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadConfig } from "../src/config.js";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/invoicepilot",
  SECRET_KEY: "x".repeat(32),
};

describe("loadConfig", () => {
  it("reads the database url and the signing key", () => {
    const config = loadConfig(valid);
    assert.equal(config.databaseUrl, valid.DATABASE_URL);
    assert.equal(config.secretKey, valid.SECRET_KEY);
  });

  it("defaults the environment to local", () => {
    assert.equal(loadConfig(valid).environment, "local");
  });

  it("defaults the port to 3001", () => {
    assert.equal(loadConfig(valid).port, 3001);
  });

  it("reads the port as a number, not a string", () => {
    assert.equal(loadConfig({ ...valid, PORT: "8080" }).port, 8080);
  });

  it("refuses a missing database url", () => {
    assert.throws(
      () => loadConfig({ SECRET_KEY: valid.SECRET_KEY }),
      /DATABASE_URL is not set/,
    );
  });

  it("refuses a missing signing key", () => {
    assert.throws(
      () => loadConfig({ DATABASE_URL: valid.DATABASE_URL }),
      /SECRET_KEY is not set/,
    );
  });

  it("refuses a signing key shorter than 32 characters", () => {
    // HS256 derives its strength from key length. A short key must stop the
    // process, not warn on every request in production.
    assert.throws(
      () => loadConfig({ ...valid, SECRET_KEY: "x".repeat(31) }),
      /at least 32 characters/,
    );
  });

  it("reads nothing from process.env when given an environment", () => {
    // The default argument is a convenience for server.js, not a hidden
    // global: a test must be able to describe the whole environment.
    assert.throws(() => loadConfig({}), /SECRET_KEY is not set/);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run from `backend/`:

```bash
node --test tests/config.test.js
```

Expected: FAIL with `Cannot find module` for `../src/config.js`.

- [ ] **Step 7: Write the implementation**

Create `backend/src/config.js`:

```js
/**
 * Runtime configuration.
 *
 * Read through a function rather than at import time, so importing any module
 * loads no environment and touches no network -- a test, a CLI command or a
 * migration can import half the application without a full .env. Ported from
 * app/core/config.py, which cached the same thing behind get_settings().
 *
 * No secret has a default that would work in production. A missing SECRET_KEY
 * stops the process rather than falling back to something guessable.
 */
const SECRET_KEY_MIN_LENGTH = 32;

export function loadConfig(env = process.env) {
  const secretKey = env.SECRET_KEY;
  if (!secretKey) throw new Error("SECRET_KEY is not set");
  if (secretKey.length < SECRET_KEY_MIN_LENGTH) {
    throw new Error(
      `SECRET_KEY must be at least ${SECRET_KEY_MIN_LENGTH} characters`,
    );
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  return {
    environment: env.NODE_ENV ?? "local",
    port: Number(env.PORT ?? 3001),
    databaseUrl,
    secretKey,
  };
}
```

`SECRET_KEY` is required in P1 although nothing reads it yet. The alternative — adding the requirement in P2 — means the first P2 deploy fails at the first login instead of at boot.

- [ ] **Step 8: Run the test to verify it passes**

Run from `backend/`:

```bash
node --test tests/config.test.js
```

Expected: PASS, 8 tests.

- [ ] **Step 9: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/.gitignore backend/.env.example backend/src/config.js backend/tests/config.test.js
git commit -m "feat: add the Express backend package and its configuration"
```

---

### Task 2: SQL files, the migration runner, and the test-database guard

**Files:**
- Create: `backend/src/sql/0000_schema.sql` (moved from `drizzle/0000_schema.sql`)
- Create: `backend/src/sql/0001_derivation_views.sql` (moved from `drizzle/0001_derivation_views.sql`)
- Create: `backend/src/db/migrate.js`
- Create: `backend/tests/helpers/database.js`
- Create: `backend/tests/reset.js`
- Test: `backend/tests/database.test.js`
- Test: `backend/tests/migrate.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `applyMigrations(connectionString: string): Promise<string[]>` — applies pending `src/sql/*.sql` files in filename order, each in its own transaction, and returns the filenames applied.
  - `assertTestDatabase(url: string): void` — throws unless the database name contains `test`, case-insensitively.
  - `testConnectionString(): string` — returns `process.env.DATABASE_URL` after asserting it is a test database.

- [ ] **Step 1: Move the SQL across, unchanged**

```bash
mkdir -p backend/src/sql
git mv drizzle/0000_schema.sql backend/src/sql/0000_schema.sql
git mv drizzle/0001_derivation_views.sql backend/src/sql/0001_derivation_views.sql
```

Do not edit either file. They were translated once from the Alembic revisions and frozen; a change here is a schema change, which §14 of the spec puts out of scope.

- [ ] **Step 2: Write the failing guard test**

Create `backend/tests/database.test.js`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertTestDatabase } from "./helpers/database.js";

describe("assertTestDatabase", () => {
  it("accepts a database whose name contains 'test'", () => {
    assert.doesNotThrow(() =>
      assertTestDatabase("postgresql://u:p@localhost:5432/invoicepilot_test"),
    );
  });

  it("accepts it regardless of case", () => {
    assert.doesNotThrow(() =>
      assertTestDatabase("postgresql://u:p@localhost:5432/InvoicePilot_TEST"),
    );
  });

  it("ignores query parameters when reading the name", () => {
    assert.doesNotThrow(() =>
      assertTestDatabase(
        "postgresql://u:p@localhost:5432/ip_test?sslmode=require",
      ),
    );
  });

  it("refuses a database that does not look like a test database", () => {
    assert.throws(
      () => assertTestDatabase("postgresql://u:p@localhost:5432/invoicepilot"),
      /does not look like a test database/,
    );
  });

  it("refuses a name that only contains 'test' in the host", () => {
    assert.throws(
      () => assertTestDatabase("postgresql://u:p@test-host:5432/production"),
      /does not look like a test database/,
    );
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run from `backend/`:

```bash
node --test tests/database.test.js
```

Expected: FAIL with `Cannot find module` for `./helpers/database.js`.

- [ ] **Step 4: Write the guard**

Create `backend/tests/helpers/database.js`:

```js
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
```

- [ ] **Step 5: Run it to verify it passes**

Run from `backend/`:

```bash
node --test tests/database.test.js
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Write the failing migration test**

Create `backend/tests/migrate.test.js`:

```js
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
```

The first two tests assert against the schema `tests/reset.js` already built, so they do not depend on the order files run in.

- [ ] **Step 7: Run it to verify it fails**

Run from `backend/`:

```bash
node --test tests/migrate.test.js
```

Expected: FAIL with `Cannot find module` for `../src/db/migrate.js`.

- [ ] **Step 8: Write the migration runner**

Create `backend/src/db/migrate.js`:

```js
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
```

- [ ] **Step 9: Write the reset script**

Create `backend/tests/reset.js`:

```js
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
```

- [ ] **Step 10: Run the whole suite to verify it passes**

Run from `backend/`, with `DATABASE_URL` pointing at a local database whose name contains `test`:

```bash
npm test
```

Expected: `reset: applied 0000_schema.sql, 0001_derivation_views.sql`, then PASS across `config.test.js`, `database.test.js` and `migrate.test.js`.

- [ ] **Step 11: Commit**

```bash
git add backend/src/sql backend/src/db/migrate.js backend/tests/helpers/database.js backend/tests/reset.js backend/tests/database.test.js backend/tests/migrate.test.js
git commit -m "feat: move the schema into the backend and port the migration runner"
```

---

### Task 3: The database client and the bigint policy

**Files:**
- Create: `backend/src/db/index.js`
- Test: `backend/tests/db.test.js`

**Interfaces:**
- Consumes: `testConnectionString()` from Task 2.
- Produces:
  - `bigintAsNumber` — the postgres.js custom type object. `bigintAsNumber.parse(value: string): number` throws when the value does not fit a JavaScript number.
  - `createClient(connectionString: string)` — a new postgres.js client configured `max: 5`, `prepare: false`, with the bigint policy applied.
  - `getSql(connectionString = process.env.DATABASE_URL)` — the memoized application client. Throws when the connection string is empty.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/db.test.js`:

```js
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { bigintAsNumber, createClient, getSql } from "../src/db/index.js";
import { testConnectionString } from "./helpers/database.js";

const sql = createClient(testConnectionString());

// Two clients to close: the one this file built, and the memoized application
// client getSql hands out. An open connection keeps the event loop alive and
// the runner never exits.
after(() => sql.end());
after(() => getSql(testConnectionString()).end());

describe("the bigint policy", () => {
  it("returns a bigint column as a number", async () => {
    // Every money column is int8. postgres.js returns those as strings by
    // default, which is how one screen ends up formatting "120000".
    const rows = await sql`SELECT 120000::bigint AS cents`;
    assert.equal(rows[0].cents, 120_000);
    assert.equal(typeof rows[0].cents, "number");
  });

  it("refuses a value that does not fit a JavaScript number", () => {
    assert.throws(
      () => bigintAsNumber.parse("9007199254740993"),
      /does not fit a JavaScript number/,
    );
  });

  it("parses the largest safe integer", () => {
    assert.equal(bigintAsNumber.parse("9007199254740991"), 9_007_199_254_740_991);
  });
});

describe("getSql", () => {
  it("refuses to build a client without a connection string", () => {
    assert.throws(() => getSql(""), /DATABASE_URL is not set/);
  });

  it("returns the same client twice", () => {
    const url = testConnectionString();
    assert.equal(getSql(url), getSql(url));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run from `backend/`:

```bash
node --test tests/db.test.js
```

Expected: FAIL with `Cannot find module` for `../src/db/index.js`.

- [ ] **Step 3: Write the client**

Create `backend/src/db/index.js`:

```js
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
```

The empty-string check comes before the memo, so `getSql("")` throws whether or not a client already exists. Checking after the memo would make the test pass or fail on file order.

- [ ] **Step 4: Run it to verify it passes**

Run from `backend/`:

```bash
node --test tests/db.test.js
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/index.js backend/tests/db.test.js
git commit -m "feat: add the database client and decide bigint parsing once"
```

---

### Task 4: The test harness — rollback, constraint assertions, factories

**Files:**
- Modify: `backend/tests/helpers/database.js`
- Create: `backend/tests/helpers/factories.js`

**Interfaces:**
- Consumes: `createClient` from Task 3, `testConnectionString` from Task 2.
- Produces:
  - `sql` — the shared test client, exported from `helpers/database.js`. Every test file that uses it registers `after(() => sql.end())`.
  - `withRollback(fn: (tx) => Promise<T>): Promise<T>` — runs `fn` in a transaction that is always rolled back, and returns its result.
  - `expectConstraintViolation(promise, constraint: string): Promise<void>` — asserts the promise rejected with that named constraint.
  - `makeWorkspace(tx): Promise<string>` — returns the new workspace id.
  - `makeCustomer(tx, workspaceId, { name, terms? }): Promise<string>` — returns the new customer id. `terms` defaults to 30.
  - `makeInvoice(tx, workspaceId, customerId, { amount, paid?, dueOffsetDays?, issueOffsetDays?, paidOffsetDays?, status? }): Promise<string>` — returns the new invoice id. `dueOffsetDays` defaults to 30, `issueOffsetDays` to `dueOffsetDays - 30`, `paid` to 0, `status` to `"sent"`.

There is no separate test for this task. The harness is exercised by every suite in Tasks 5 through 8, and a test of `withRollback` that did not also test a real table would assert nothing the next task does not.

- [ ] **Step 1: Add the shared client and the rollback helper**

Append to `backend/tests/helpers/database.js`:

```js
import assert from "node:assert/strict";

import { createClient } from "../../src/db/index.js";

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
```

Put the two `import` lines at the top of the file, above `assertTestDatabase`, and the rest below `testConnectionString`.

- [ ] **Step 2: Write the factories**

Create `backend/tests/helpers/factories.js`:

```js
/**
 * Row builders shared by every test file.
 *
 * Invoices are described in offsets from today ("due 40 days ago") rather than
 * in literal dates, because every derived value in the views is a function of
 * CURRENT_DATE. A fixture pinned to a literal date starts failing on its own
 * the following morning.
 */

export async function makeWorkspace(tx) {
  const rows = await tx`
    INSERT INTO workspaces (id, name, slug)
    VALUES (
      gen_random_uuid(), 'Test Workspace',
      'test-' || substr(gen_random_uuid()::text, 1, 8)
    )
    RETURNING id
  `;
  return rows[0].id;
}

export async function makeCustomer(tx, workspaceId, options) {
  const terms = options.terms ?? 30;
  const rows = await tx`
    INSERT INTO customers (
      id, workspace_id, name, contact_name, email,
      payment_terms_days, customer_since
    ) VALUES (
      gen_random_uuid(), ${workspaceId}, ${options.name},
      ${`Contact for ${options.name}`},
      -- Unique per row: customers are unique on (workspace_id, email).
      gen_random_uuid()::text || '@example.test',
      ${terms}, CURRENT_DATE - 365
    )
    RETURNING id
  `;
  return rows[0].id;
}

export async function makeInvoice(tx, workspaceId, customerId, options) {
  const due = options.dueOffsetDays ?? 30;
  // Defaults to thirty days before the due date so the due_date >= issue_date
  // check always holds.
  const issue = options.issueOffsetDays ?? due - 30;
  const paidOffset = options.paidOffsetDays ?? null;
  const rows = await tx`
    INSERT INTO invoices (
      id, workspace_id, number, customer_id, status,
      amount_cents, paid_cents, issue_date, due_date, paid_date
    ) VALUES (
      gen_random_uuid(), ${workspaceId},
      -- Unique per row: invoices are unique on (workspace_id, number).
      'INV-' || substr(gen_random_uuid()::text, 1, 12),
      ${customerId},
      CAST(${options.status ?? "sent"} AS invoice_status),
      ${options.amount}, ${options.paid ?? 0},
      CURRENT_DATE + CAST(${issue} AS integer),
      CURRENT_DATE + CAST(${due} AS integer),
      ${
        paidOffset === null
          ? tx`NULL::date`
          : tx`CURRENT_DATE + CAST(${paidOffset} AS integer)`
      }
    )
    RETURNING id
  `;
  return rows[0].id;
}
```

`NULL::date` rather than a `null` parameter: Postgres cannot infer a parameter's type in that position and answers `could not determine data type of parameter`.

- [ ] **Step 3: Verify the suite still passes**

Run from `backend/`:

```bash
npm test
```

Expected: PASS. Nothing imports the new helpers yet, so this only proves the files parse.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/helpers
git commit -m "test: port the rollback harness and the row factories"
```

---

### Task 5: The schema constraint suite

**Files:**
- Test: `backend/tests/schema.test.js`

**Interfaces:**
- Consumes: `withRollback`, `expectConstraintViolation`, `sql` from Task 4; `makeWorkspace`, `makeCustomer`, `makeInvoice` from Task 4.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/schema.test.js`:

```js
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import {
  expectConstraintViolation,
  sql,
  withRollback,
} from "./helpers/database.js";
import { makeCustomer, makeInvoice, makeWorkspace } from "./helpers/factories.js";

after(() => sql.end());

describe("invoice constraints", () => {
  it("rejects an invoice with a non-positive amount", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Zero Co" });
      await expectConstraintViolation(
        makeInvoice(tx, ws, customer, { amount: 0 }),
        "ck_invoices_amount_positive",
      );
    });
  });

  it("rejects paid_cents greater than amount_cents", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Overpaid Co" });
      await expectConstraintViolation(
        makeInvoice(tx, ws, customer, { amount: 10_000, paid: 10_001 }),
        "ck_invoices_paid_within_amount",
      );
    });
  });

  it("rejects a due date before the issue date", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Backwards Co" });
      await expectConstraintViolation(
        makeInvoice(tx, ws, customer, {
          amount: 10_000,
          dueOffsetDays: -10,
          issueOffsetDays: 0,
        }),
        "ck_invoices_due_after_issue",
      );
    });
  });

  it("rejects a second invoice with the same number in one workspace", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Duplicate Co" });
      await tx`
        INSERT INTO invoices (
          id, workspace_id, number, customer_id, amount_cents,
          issue_date, due_date
        ) VALUES (
          gen_random_uuid(), ${ws}, 'INV-1', ${customer}, 10000,
          CURRENT_DATE, CURRENT_DATE
        )
      `;
      await expectConstraintViolation(
        tx`
          INSERT INTO invoices (
            id, workspace_id, number, customer_id, amount_cents,
            issue_date, due_date
          ) VALUES (
            gen_random_uuid(), ${ws}, 'INV-1', ${customer}, 20000,
            CURRENT_DATE, CURRENT_DATE
          )
        `,
        "uq_invoices_workspace_number",
      );
    });
  });
});

describe("balance_cents", () => {
  it("is amount minus paid", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Partial Co" });
      const invoice = await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        paid: 30_000,
      });
      const rows = await tx`
        SELECT balance_cents FROM invoices WHERE id = ${invoice}
      `;
      assert.equal(rows[0].balance_cents, 70_000);
    });
  });

  it("cannot be written directly", async () => {
    // A generated column. Postgres rejects the write with no constraint name,
    // so this asserts the rejection rather than a named constraint.
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Forged Co" });
      const invoice = await makeInvoice(tx, ws, customer, { amount: 100_000 });
      await assert.rejects(
        tx`UPDATE invoices SET balance_cents = 1 WHERE id = ${invoice}`,
      );
    });
  });
});

describe("workspace_members constraints", () => {
  it("rejects a role outside the four", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      await expectConstraintViolation(
        tx`
          INSERT INTO workspace_members (id, workspace_id, invited_email, role)
          VALUES (gen_random_uuid(), ${ws}, 'someone@example.test', 'superuser')
        `,
        "ck_workspace_members_role",
      );
    });
  });

  it("rejects a member with neither a user nor an invited email", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      await expectConstraintViolation(
        tx`
          INSERT INTO workspace_members (id, workspace_id)
          VALUES (gen_random_uuid(), ${ws})
        `,
        "ck_workspace_members_identified",
      );
    });
  });
});

describe("users", () => {
  it("treats email as case-insensitive for uniqueness", async () => {
    await withRollback(async (tx) => {
      await tx`
        INSERT INTO users (id, email, full_name, password_hash)
        VALUES (gen_random_uuid(), 'Sam@example.test', 'Sam', 'x')
      `;
      await expectConstraintViolation(
        tx`
          INSERT INTO users (id, email, full_name, password_hash)
          VALUES (gen_random_uuid(), 'sam@example.test', 'Sam Again', 'x')
        `,
        "uq_users_email_lower",
      );
    });
  });
});

describe("communication_logs", () => {
  it("collides on a repeated idempotency key in one workspace", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Reminded Co" });
      const insert = (key) => tx`
        INSERT INTO communication_logs (
          id, workspace_id, customer_id, to_address, subject, body,
          idempotency_key, queued_at
        ) VALUES (
          gen_random_uuid(), ${ws}, ${customer}, 'a@example.test',
          'Reminder', 'Body', ${key}, now()
        )
      `;
      await insert("same-key");
      await expectConstraintViolation(
        insert("same-key"),
        "uq_communication_logs_workspace_key",
      );
    });
  });
});
```

- [ ] **Step 2: Run it**

Run from `backend/`:

```bash
npm test
```

Expected: PASS, 10 tests in this file. The schema and the harness both already exist, so a failure here is a porting error in Task 4, not a missing implementation — read the failure before changing anything.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/schema.test.js
git commit -m "test: port the schema constraint suite"
```

---

### Task 6: The invoice_state suite

**Files:**
- Test: `backend/tests/views-invoice-state.test.js`

**Interfaces:**
- Consumes: `withRollback`, `sql`, the three factories.
- Produces: nothing.

- [ ] **Step 1: Write the test**

Create `backend/tests/views-invoice-state.test.js`:

```js
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { sql, withRollback } from "./helpers/database.js";
import { makeCustomer, makeInvoice, makeWorkspace } from "./helpers/factories.js";

after(() => sql.end());

async function state(tx, invoiceId) {
  const rows = await tx`SELECT * FROM invoice_state WHERE id = ${invoiceId}`;
  return rows[0];
}

describe("invoice_state", () => {
  it("counts days_overdue from the due date", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Late Co" });
      const invoice = await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        dueOffsetDays: -40,
      });
      assert.equal((await state(tx, invoice)).days_overdue, 40);
    });
  });

  it("reports a negative days_overdue before the due date", async () => {
    // Negative rather than zero or null, so a caller can sort every open
    // invoice on one column and get "most overdue first" for free.
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Early Co" });
      const invoice = await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        dueOffsetDays: 10,
      });
      assert.equal((await state(tx, invoice)).days_overdue, -10);
    });
  });

  it("does not call a paid invoice overdue, however late it was", async () => {
    // It was paid late; it is not owed. Owing money is what overdue means.
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Paid Late Co" });
      const invoice = await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        paid: 100_000,
        dueOffsetDays: -40,
        paidOffsetDays: -5,
        status: "paid",
      });
      assert.equal((await state(tx, invoice)).is_overdue, false);
    });
  });

  it("does not call a draft overdue", async () => {
    // A draft was never sent, so nobody owes anything yet. Counting drafts
    // would fill the collections queue with invoices the customer has never
    // seen.
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Draft Co" });
      const invoice = await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        dueOffsetDays: -40,
        status: "draft",
      });
      assert.equal((await state(tx, invoice)).is_overdue, false);
    });
  });

  it("calls a partially paid late invoice overdue for its balance", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Partial Co" });
      const invoice = await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        paid: 30_000,
        dueOffsetDays: -15,
        status: "partially_paid",
      });
      const row = await state(tx, invoice);
      assert.equal(row.is_overdue, true);
      assert.equal(row.balance_cents, 70_000);
      assert.equal(row.customer_name, "Partial Co");
    });
  });
});
```

- [ ] **Step 2: Run it**

Run from `backend/`:

```bash
npm test
```

Expected: PASS, 5 tests in this file.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/views-invoice-state.test.js
git commit -m "test: port the invoice_state view suite"
```

---

### Task 7: The customer_stats suite

**Files:**
- Test: `backend/tests/views-customer-stats.test.js`

**Interfaces:**
- Consumes: `withRollback`, `sql`, the three factories.
- Produces: nothing.

- [ ] **Step 1: Write the test**

Create `backend/tests/views-customer-stats.test.js`:

```js
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { sql, withRollback } from "./helpers/database.js";
import { makeCustomer, makeInvoice, makeWorkspace } from "./helpers/factories.js";

after(() => sql.end());

async function stats(tx, customerId) {
  const rows = await tx`
    SELECT * FROM customer_stats WHERE customer_id = ${customerId}
  `;
  return rows[0];
}

describe("customer_stats", () => {
  it("grades a customer with no history low", async () => {
    // Grading a brand-new customer 'high' would flag every account on the day
    // it is created, which trains people to ignore the badge.
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Brand New" });
      const row = await stats(tx, customer);
      assert.equal(row.risk, "low");
      assert.equal(row.risk_reason, "No payment history yet");
      assert.equal(row.outstanding_cents, 0);
      assert.equal(row.open_invoice_count, 0);
    });
  });

  it("sums outstanding and overdue separately", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Mixed" });
      await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        dueOffsetDays: -5,
      });
      await makeInvoice(tx, ws, customer, {
        amount: 40_000,
        dueOffsetDays: 20,
      });
      const row = await stats(tx, customer);
      assert.equal(row.outstanding_cents, 140_000);
      assert.equal(row.overdue_cents, 100_000);
      assert.equal(row.open_invoice_count, 2);
    });
  });

  it("counts the on-time rate over settled invoices only", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Settled" });
      // Three paid: two on time, one late.
      await makeInvoice(tx, ws, customer, {
        amount: 10_000, paid: 10_000,
        dueOffsetDays: -60, paidOffsetDays: -65, status: "paid",
      });
      await makeInvoice(tx, ws, customer, {
        amount: 10_000, paid: 10_000,
        dueOffsetDays: -50, paidOffsetDays: -52, status: "paid",
      });
      await makeInvoice(tx, ws, customer, {
        amount: 10_000, paid: 10_000,
        dueOffsetDays: -40, paidOffsetDays: -20, status: "paid",
      });
      assert.equal((await stats(tx, customer)).on_time_rate, 67); // 2 of 3, rounded
    });
  });

  it("grades a long overdue balance high", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Stale" });
      await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        dueOffsetDays: -90,
      });
      const row = await stats(tx, customer);
      assert.equal(row.risk, "high");
      assert.ok(
        row.risk_reason.includes("90 days past due"),
        `risk_reason was ${JSON.stringify(row.risk_reason)}`,
      );
    });
  });

  it("grades a slightly late balance medium", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Slipping" });
      await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        dueOffsetDays: -20,
      });
      assert.equal((await stats(tx, customer)).risk, "medium");
    });
  });

  it("never returns null for a customer without invoices", async () => {
    // NULL propagates through every downstream sum and percentage.
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Empty" });
      const row = await stats(tx, customer);
      for (const field of [
        "outstanding_cents",
        "overdue_cents",
        "total_invoiced_cents",
        "avg_days_to_pay",
        "on_time_rate",
        "open_invoice_count",
        "oldest_open_days",
      ]) {
        assert.notEqual(row[field], null, field);
      }
    });
  });
});
```

- [ ] **Step 2: Run it**

Run from `backend/`:

```bash
npm test
```

Expected: PASS, 6 tests in this file.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/views-customer-stats.test.js
git commit -m "test: port the customer_stats view suite"
```

---

### Task 8: The collection_queue suite

**Files:**
- Test: `backend/tests/views-collection-queue.test.js`

**Interfaces:**
- Consumes: `withRollback`, `sql`, the three factories.
- Produces: nothing.

- [ ] **Step 1: Write the test**

Create `backend/tests/views-collection-queue.test.js`:

```js
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { sql, withRollback } from "./helpers/database.js";
import { makeCustomer, makeInvoice, makeWorkspace } from "./helpers/factories.js";

after(() => sql.end());

describe("collection_queue", () => {
  it("keeps one invoice per customer", async () => {
    // You chase a customer, not an invoice. Three rows for one account turns a
    // work queue into a list.
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Repeat" });
      await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        dueOffsetDays: -10,
      });
      await makeInvoice(tx, ws, customer, {
        amount: 20_000,
        dueOffsetDays: -12,
      });
      const rows = await tx`
        SELECT * FROM collection_queue WHERE workspace_id = ${ws}
      `;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].balance_cents, 100_000);
    });
  });

  it("excludes invoices that are not overdue", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const customer = await makeCustomer(tx, ws, { name: "Current" });
      await makeInvoice(tx, ws, customer, {
        amount: 100_000,
        dueOffsetDays: 14,
      });
      const rows = await tx`
        SELECT * FROM collection_queue WHERE workspace_id = ${ws}
      `;
      assert.equal(rows.length, 0);
    });
  });

  it("decays the recovery score with age", async () => {
    // A big balance dead for 200 days is worth less of your morning than a
    // smaller one that just slipped, so the queue must not rank on value alone.
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const fresh = await makeCustomer(tx, ws, { name: "Fresh" });
      const stale = await makeCustomer(tx, ws, { name: "Stale" });
      await makeInvoice(tx, ws, fresh, {
        amount: 100_000,
        dueOffsetDays: -5,
      });
      await makeInvoice(tx, ws, stale, {
        amount: 150_000,
        dueOffsetDays: -200,
      });
      const rows = await tx`
        SELECT customer_name, recovery_score FROM collection_queue
        WHERE workspace_id = ${ws} ORDER BY recovery_score DESC
      `;
      assert.deepEqual(
        rows.map((row) => row.customer_name),
        ["Fresh", "Stale"],
      );
    });
  });
});
```

- [ ] **Step 2: Run it**

Run from `backend/`:

```bash
npm test
```

Expected: PASS, 3 tests in this file, and green across all eight files.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/views-collection-queue.test.js
git commit -m "test: port the collection_queue view suite"
```

---

### Task 9: Error middleware, the Express app, and the model stubs

**Files:**
- Create: `backend/src/middleware/errors.js`
- Create: `backend/src/app.js`
- Create: `backend/src/server.js`
- Create: `backend/src/models/{ai,audit,auth,automations,billing,collections,customers,integrations,invoices,notifications,payments,reports,users,workspaces}.js`
- Test: `backend/tests/errors.test.js`
- Test: `backend/tests/health.test.js`

**Interfaces:**
- Consumes: `loadConfig` from Task 1, `applyMigrations` from Task 2.
- Produces:
  - `DomainError` and the subclasses `NotFound` (404), `PermissionDenied` (403), `AuthenticationFailed` (401), `ValidationFailed` (422), `Conflict` (409). Each instance carries `status: number` and `detail: string`.
  - `errorHandler(error, request, response, next)` — the Express error middleware.
  - `createApp(config)` — returns the configured Express application.

- [ ] **Step 1: Write the failing error test**

Create `backend/tests/errors.test.js`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AuthenticationFailed,
  Conflict,
  DomainError,
  NotFound,
  PermissionDenied,
  ValidationFailed,
  errorHandler,
} from "../src/middleware/errors.js";

function fakeResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    headersSent: false,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const request = { path: "/api/invoices/1" };

describe("the domain error hierarchy", () => {
  it("carries a status and a default detail per class", () => {
    assert.equal(new DomainError().status, 400);
    assert.equal(new NotFound().status, 404);
    assert.equal(new NotFound().detail, "Not found");
    assert.equal(new PermissionDenied().status, 403);
    assert.equal(new ValidationFailed().status, 422);
    assert.equal(new Conflict().status, 409);
  });

  it("takes an overriding detail", () => {
    assert.equal(new Conflict("That email is taken").detail, "That email is taken");
  });

  it("fixes the detail of an authentication failure", () => {
    // Deliberately detail-free: distinguishing "expired" from "malformed" from
    // "wrong signature" tells an attacker which guess was closer.
    assert.equal(new AuthenticationFailed("expired token").detail, "Invalid credentials");
    assert.equal(new AuthenticationFailed().status, 401);
  });
});

describe("errorHandler", () => {
  it("answers a domain error with its status and detail", () => {
    const response = fakeResponse();
    errorHandler(new NotFound(), request, response, () => {});
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { detail: "Not found" });
  });

  it("sets WWW-Authenticate on a 401", () => {
    const response = fakeResponse();
    errorHandler(new AuthenticationFailed(), request, response, () => {});
    assert.equal(response.headers["WWW-Authenticate"], "Bearer");
  });

  it("hides an unexpected error behind a request id", (t) => {
    // Stack traces have connection strings in them. The client gets an id that
    // support can search the logs for, and nothing else.
    t.mock.method(console, "error", () => {});
    const response = fakeResponse();
    errorHandler(new Error("postgres://user:hunter2@host"), request, response, () => {});
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.detail, "Internal server error");
    assert.match(response.body.request_id, /^[0-9a-f]{32}$/);
  });

  it("hands a late error back to Express once the response has started", () => {
    const response = { ...fakeResponse(), headersSent: true };
    let handedBack = null;
    const error = new NotFound();
    errorHandler(error, request, response, (passed) => {
      handedBack = passed;
    });
    assert.equal(handedBack, error);
    assert.equal(response.statusCode, null);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run from `backend/`:

```bash
node --test tests/errors.test.js
```

Expected: FAIL with `Cannot find module` for `../src/middleware/errors.js`.

- [ ] **Step 3: Write the error middleware**

Create `backend/src/middleware/errors.js`:

```js
/**
 * Domain errors and the single place they become HTTP.
 *
 * Services throw these; controllers never catch them. That keeps a controller
 * to "validate, delegate, shape" and keeps the status-code policy -- especially
 * "cross-tenant is 404, not 403" -- in one readable place.
 *
 * Ported from app/core/errors.py.
 */
import { randomUUID } from "node:crypto";

export class DomainError extends Error {
  static status = 400;
  static defaultDetail = "Request failed";

  constructor(detail) {
    super(detail ?? new.target.defaultDetail);
    this.name = new.target.name;
    this.status = new.target.status;
    this.detail = this.message;
  }
}

/**
 * Also thrown for a record in another workspace. Answering 403 there would
 * confirm the record exists, which turns a list of guessed ids into a census of
 * another tenant's data.
 */
export class NotFound extends DomainError {
  static status = 404;
  static defaultDetail = "Not found";
}

export class PermissionDenied extends DomainError {
  static status = 403;
  static defaultDetail = "Not permitted";
}

/** Deliberately detail-free: the message is fixed, whatever the cause. */
export class AuthenticationFailed extends DomainError {
  static status = 401;
  static defaultDetail = "Invalid credentials";

  constructor() {
    super(AuthenticationFailed.defaultDetail);
  }
}

export class ValidationFailed extends DomainError {
  static status = 422;
  static defaultDetail = "Invalid request";
}

export class Conflict extends DomainError {
  static status = 409;
  static defaultDetail = "Already exists";
}

export function errorHandler(error, request, response, next) {
  // Express cannot change a response it has already started sending, so a late
  // error goes to the default handler, which closes the connection.
  if (response.headersSent) return next(error);

  if (error instanceof DomainError) {
    if (error.status === 401) response.set("WWW-Authenticate", "Bearer");
    return response.status(error.status).json({ detail: error.detail });
  }

  // Logged with an id so support can find this exact request; the client gets
  // the id and nothing else. Stack traces have connection strings in them.
  const requestId = randomUUID().replaceAll("-", "");
  console.error(
    `unhandled error request_id=${requestId} path=${request.path}`,
    error,
  );
  return response
    .status(500)
    .json({ detail: "Internal server error", request_id: requestId });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run from `backend/`:

```bash
node --test tests/errors.test.js
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing health test**

Create `backend/tests/health.test.js`:

```js
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { createApp } from "../src/app.js";

const config = {
  environment: "test",
  port: 0,
  databaseUrl: "postgresql://unused",
  secretKey: "x".repeat(32),
};

let server;
let origin;

before(async () => {
  server = createApp(config).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

describe("GET /health", () => {
  it("answers 200 with the environment", async () => {
    const response = await fetch(`${origin}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      environment: "test",
    });
  });

  it("opens no database connection", async () => {
    // createApp takes a config but builds no client: the health check is what
    // Render polls, and it must answer while Neon is still waking.
    const response = await fetch(`${origin}/health`);
    assert.equal(response.status, 200);
  });
});

describe("an unknown path", () => {
  it("answers 404", async () => {
    const response = await fetch(`${origin}/api/nothing-here`);
    assert.equal(response.status, 404);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run from `backend/`:

```bash
node --test tests/health.test.js
```

Expected: FAIL with `Cannot find module` for `../src/app.js`.

- [ ] **Step 7: Write the app**

Create `backend/src/app.js`:

```js
import express from "express";

import { errorHandler } from "./middleware/errors.js";

/**
 * No CORS middleware. The browser never calls this service: every request
 * arrives from the Next.js server with a bearer token. Adding CORS would mean
 * opening a public browser-facing surface that has no CSRF story.
 *
 * Routers are mounted under /api in P2. Until then this serves the health check
 * Render polls, and nothing else.
 */
export function createApp(config) {
  const app = express();

  app.use(express.json());

  app.get("/health", (request, response) => {
    response.json({ status: "ok", environment: config.environment });
  });

  // Last. Express 5 routes a rejected handler promise here on its own, so no
  // controller needs its own try/catch.
  app.use(errorHandler);

  return app;
}
```

- [ ] **Step 8: Write the server entry point**

Create `backend/src/server.js`:

```js
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { applyMigrations } from "./db/migrate.js";

/**
 * Migrations run before listen(), not as a deploy hook: Render's free plan has
 * none. The _migrations table makes it idempotent, and a free plan runs one
 * instance, so nothing races.
 */
const config = loadConfig();

const applied = await applyMigrations(config.databaseUrl);
console.log(
  applied.length ? `applied: ${applied.join(", ")}` : "schema up to date",
);

createApp(config).listen(config.port, () => {
  console.log(`listening on ${config.port} (${config.environment})`);
});
```

- [ ] **Step 9: Run the health test to verify it passes**

Run from `backend/`:

```bash
node --test tests/health.test.js
```

Expected: PASS, 3 tests.

- [ ] **Step 10: Start the server and check it by hand**

Run from `backend/`, with `DATABASE_URL` and `SECRET_KEY` set:

```bash
npm start
```

In another terminal:

```bash
curl -s http://127.0.0.1:3001/health
```

Expected: `{"status":"ok","environment":"local"}`. Stop the server afterwards.

- [ ] **Step 11: Create the fourteen model stubs**

Each file holds only its header comment. They are a map of the schema, and each is filled in by the phase that implements its domain.

`backend/src/models/invoices.js`:

```js
/**
 * Invoices. Owns: invoices, invoice_items, and the invoice_state view.
 *
 * Empty until the invoices endpoints are implemented. Every query function
 * takes the principal's workspace id as its first argument and builds its
 * statement through the shared scoping helper, so no query reaches a tenant
 * table unscoped.
 */
```

Create the remaining thirteen with the same shape, changing the first line and the table list:

| File | First line | Owns |
|---|---|---|
| `auth.js` | `Authentication.` | `users`, `refresh_tokens`, `workspace_members` |
| `users.js` | `Users.` | `users`, `workspace_members` |
| `workspaces.js` | `Workspaces.` | `workspaces`, `workspace_members` |
| `customers.js` | `Customers.` | `customers`, and the `customer_stats` view |
| `payments.js` | `Payments.` | `payments` |
| `collections.js` | `Collections.` | `collection_events`, and the `collection_queue` view |
| `notifications.js` | `Notifications.` | `communication_logs`, `email_templates` |
| `reports.js` | `Reports.` | the `invoice_state` and `customer_stats` views, read-only |
| `audit.js` | `Audit.` | `audit_logs` |
| `integrations.js` | `Integrations.` | `import_batches` |
| `billing.js` | `Billing.` | `workspaces.plan` |
| `automations.js` | `Automations.` | no table yet; the schema lands with the automations sub-project |
| `ai.js` | `AI.` | no table; reads the derivation views |

- [ ] **Step 12: Run the whole suite**

Run from `backend/`:

```bash
npm test
```

Expected: PASS across all ten files.

- [ ] **Step 13: Commit**

```bash
git add backend/src/middleware backend/src/app.js backend/src/server.js backend/src/models backend/tests/errors.test.js backend/tests/health.test.js
git commit -m "feat: add the error middleware, the Express app, and the model stubs"
```

---

### Task 10: Remove the TypeScript backend layer and switch CI

**Files:**
- Delete: `src/server/` (10 files), `drizzle/`, `scripts/migrate.mts`, `drizzle.config.ts`, `vitest.config.mts`
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the working `backend/` package from Tasks 1 through 9.
- Produces: nothing.

No frontend file imports `@/server` or any drizzle package — verified by grep before this plan was written. Step 1 re-checks rather than trusting that.

- [ ] **Step 1: Confirm nothing in the frontend depends on what is about to be deleted**

Run from the repository root:

```bash
grep -rn "@/server\|drizzle" --include="*.ts" --include="*.tsx" src/ next.config.ts
```

Expected: no output. Any hit must be resolved before deleting; stop and report it.

- [ ] **Step 2: Delete the TypeScript backend layer**

```bash
git rm -r src/server drizzle
git rm scripts/migrate.mts drizzle.config.ts vitest.config.mts
```

`drizzle/` is already empty of SQL after Task 2 moved both files; this removes the directory itself. `scripts/` holds nothing else and disappears with its only file.

- [ ] **Step 3: Prune the root manifest**

In `package.json`, delete the `db:migrate`, `db:pull`, `test` and `test:watch` scripts, and delete `drizzle-orm` and `postgres` from `dependencies` and `drizzle-kit`, `tsx` and `vitest` from `devDependencies`. The scripts block becomes:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
```

- [ ] **Step 4: Refresh the root lockfile**

Run from the repository root:

```bash
npm install
```

Expected: `package-lock.json` changes, and `node_modules/drizzle-orm` disappears.

- [ ] **Step 5: Repoint the root environment example**

Replace the contents of `.env.example` with:

```bash
# The Express backend. Locally that is `npm start` inside backend/; on Vercel it
# is the Render service URL. The browser never sees this: only the Next server
# calls it, with a bearer token.
API_BASE_URL="http://127.0.0.1:3001"
```

`DATABASE_URL` moves out of the root entirely — it is documented in `backend/.env.example` and nothing at the root opens a connection any more.

- [ ] **Step 6: Switch CI to two jobs**

Replace `.github/workflows/ci.yml` with:

```yaml
name: CI

on: [push, pull_request]

jobs:
  backend:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: invoicepilot_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/invoicepilot_test

    defaults:
      run:
        working-directory: backend

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: backend/package-lock.json
      - run: npm ci
      - run: npm test

  frontend:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run build
```

The frontend job needs no database now: nothing it builds opens a connection.

This is the deviation recorded under Scope. Spec §13 puts "CI switched" in P3, but Step 3 deletes the root `test` script that the single existing job runs.

- [ ] **Step 7: Verify the frontend still type-checks and builds**

Run from the repository root:

```bash
npx tsc --noEmit
npm run build
```

Expected: both succeed. `tsc` no longer sees `src/server/` or `scripts/migrate.mts`, and `next build` compiles every route as before.

- [ ] **Step 8: Verify the backend suite still passes**

Run from `backend/`:

```bash
npm test
```

Expected: PASS across all ten files.

- [ ] **Step 9: Commit**

```bash
# The deletions are already staged by `git rm`; this picks up the edited files.
git add package.json package-lock.json .env.example .github/workflows/ci.yml
git commit -m "refactor: drop the TypeScript backend layer and split CI in two"
```

---

## Done when

- `npm test` in `backend/` is green: ten files, 55 tests, against a local Postgres whose database name contains `test`.
- `npm start` in `backend/` applies both migrations and answers `GET /health` with `{"status":"ok","environment":"local"}`.
- `npx tsc --noEmit` and `npm run build` pass at the repository root.
- No `.ts` file remains outside `src/` at the root, and no TypeScript file imports a database driver.
- `backend/app/` is untouched and still runs. It is deleted in P3.
