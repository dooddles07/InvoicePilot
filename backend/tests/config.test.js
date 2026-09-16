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
