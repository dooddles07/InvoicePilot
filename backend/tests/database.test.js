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
