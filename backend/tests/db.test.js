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
