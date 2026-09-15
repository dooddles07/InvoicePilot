import { describe, expect, it } from "vitest";

import { assertTestDatabase } from "./database";

describe("assertTestDatabase", () => {
  it("accepts a database whose name contains 'test'", () => {
    expect(() =>
      assertTestDatabase("postgresql://u:p@localhost:5432/invoicepilot_test"),
    ).not.toThrow();
  });

  it("accepts it regardless of case", () => {
    expect(() =>
      assertTestDatabase("postgresql://u:p@localhost:5432/InvoicePilot_TEST"),
    ).not.toThrow();
  });

  it("ignores query parameters when reading the name", () => {
    expect(() =>
      assertTestDatabase(
        "postgresql://u:p@localhost:5432/ip_test?sslmode=require",
      ),
    ).not.toThrow();
  });

  it("refuses a database that does not look like a test database", () => {
    expect(() =>
      assertTestDatabase("postgresql://u:p@localhost:5432/invoicepilot"),
    ).toThrow(/does not look like a test database/);
  });

  it("refuses a name that only contains 'test' in the host", () => {
    expect(() =>
      assertTestDatabase("postgresql://u:p@test-host:5432/production"),
    ).toThrow(/does not look like a test database/);
  });
});
