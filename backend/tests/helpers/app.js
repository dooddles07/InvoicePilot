/**
 * A listening app bound to one rolled-back transaction.
 *
 * The handle passed to createApp is the test's transaction, so every request
 * the app serves writes inside it and nothing survives the test. Equivalent to
 * the dependency_overrides[get_session] trick in the Python conftest.
 *
 * The server is started and stopped per test. closeAllConnections() is not
 * optional: global fetch keeps its sockets alive, and server.close() alone
 * waits for them forever.
 */
import { createApp } from "../../src/app.js";
import { withRollback } from "./database.js";

export const TEST_CONFIG = Object.freeze({
  environment: "test",
  port: 0,
  databaseUrl: "postgresql://unused",
  secretKey: "test-only-key-that-is-long-enough-for-hs256",
});

export async function withApp(fn) {
  return withRollback(async (tx) => {
    const server = createApp(TEST_CONFIG, tx).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;

    async function send(method, path, { body, token } = {}) {
      const response = await fetch(`${origin}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        body: text === "" ? null : JSON.parse(text),
      };
    }

    try {
      return await fn({ send, tx });
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
}
