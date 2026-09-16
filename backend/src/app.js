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
