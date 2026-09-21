/**
 * GET/POST /api/webhooks, DELETE /api/webhooks/:endpointId,
 * POST /api/webhooks/:endpointId/test.
 *
 * A local HTTP server stands in for "your own systems" so one test can
 * verify the HMAC signature actually matches, rather than only ever
 * exercising the network-failure path.
 */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { after, describe, it } from "node:test";

import { issueAccessToken, makePrincipal } from "../src/lib/security.js";
import { sql } from "./helpers/database.js";
import { makeWorkspace } from "./helpers/factories.js";
import { TEST_CONFIG, withApp } from "./helpers/app.js";

after(() => sql.end());

async function tokenFor(workspaceId, role = "owner") {
  return issueAccessToken(
    makePrincipal(randomUUID(), workspaceId, role),
    TEST_CONFIG.secretKey,
  );
}

/** A one-request local server, so the test does not need a real internet
 *  endpoint to prove delivery actually posts a signed body. */
async function withReceiver(fn) {
  let resolveReceived;
  const received = new Promise((resolve) => {
    resolveReceived = resolve;
  });
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      resolveReceived({ body, signature: request.headers["x-invoicepilot-signature"] });
      response.writeHead(200);
      response.end();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    await fn(`http://127.0.0.1:${port}/hook`, received);
  } finally {
    server.close();
  }
}

describe("POST /api/webhooks", () => {
  it("returns the signing secret once", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const response = await send("POST", "/api/webhooks", {
        token: await tokenFor(ws),
        body: { url: "https://ops.example.test/hooks", events: ["payment.received"] },
      });

      assert.equal(response.status, 201);
      assert.equal(typeof response.body.secret, "string");
      assert.ok(response.body.secret.length > 0);
      assert.equal(response.body.status, "active");
    });
  });
});

describe("GET /api/webhooks", () => {
  it("never returns the signing secret", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const token = await tokenFor(ws);
      await send("POST", "/api/webhooks", {
        token,
        body: { url: "https://ops.example.test/hooks", events: ["payment.received"] },
      });

      const response = await send("GET", "/api/webhooks", { token });
      assert.equal(response.body.data.length, 1);
      assert.equal(response.body.data[0].secret, undefined);
    });
  });

  it("does not return another workspace's endpoints", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      await send("POST", "/api/webhooks", {
        token: await tokenFor(theirs),
        body: { url: "https://ops.example.test/hooks", events: ["payment.received"] },
      });

      const response = await send("GET", "/api/webhooks", { token: await tokenFor(mine) });
      assert.deepEqual(response.body.data, []);
    });
  });
});

describe("POST /api/webhooks/:endpointId/test", () => {
  it("delivers a correctly signed payload to a real endpoint", async () => {
    await withApp(async ({ send, tx }) => {
      await withReceiver(async (url, received) => {
        const ws = await makeWorkspace(tx);
        const token = await tokenFor(ws);
        const created = await send("POST", "/api/webhooks", {
          token,
          body: { url, events: ["payment.received"] },
        });

        const response = await send("POST", `/api/webhooks/${created.body.id}/test`, { token });
        assert.equal(response.status, 200);
        assert.equal(response.body.delivered, true);

        const { body, signature } = await received;
        const expected = createHmac("sha256", created.body.secret).update(body, "utf8").digest("hex");
        assert.equal(signature, expected);
        assert.equal(JSON.parse(body).type, "test.ping");
      });
    });
  });

  it("marks the endpoint failing after repeated failed deliveries", async () => {
    await withApp(async ({ send, tx }) => {
      const ws = await makeWorkspace(tx);
      const token = await tokenFor(ws);
      const created = await send("POST", "/api/webhooks", {
        token,
        // Port 1 on loopback refuses instantly rather than timing out --
        // fast, deterministic failures for this test.
        body: { url: "http://127.0.0.1:1/hook", events: ["payment.received"] },
      });

      for (let i = 0; i < 3; i++) {
        await send("POST", `/api/webhooks/${created.body.id}/test`, { token });
      }

      const response = await send("GET", "/api/webhooks", { token });
      const endpoint = response.body.data.find((e) => e.id === created.body.id);
      assert.equal(endpoint.status, "failing");
      assert.equal(endpoint.failure_count, 3);
    });
  });
});

describe("DELETE /api/webhooks/:endpointId", () => {
  it("answers 404 for an endpoint in another workspace", async () => {
    await withApp(async ({ send, tx }) => {
      const mine = await makeWorkspace(tx);
      const theirs = await makeWorkspace(tx);
      const created = await send("POST", "/api/webhooks", {
        token: await tokenFor(theirs),
        body: { url: "https://ops.example.test/hooks", events: ["payment.received"] },
      });

      const response = await send("DELETE", `/api/webhooks/${created.body.id}`, {
        token: await tokenFor(mine),
      });
      assert.equal(response.status, 404);
    });
  });
});
