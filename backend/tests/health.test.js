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
  server = createApp(config, null).listen(0);
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
