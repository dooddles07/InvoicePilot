import express from "express";

import { errorHandler } from "./middleware/errors.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";

/**
 * No CORS middleware. The browser never calls this service: every request
 * arrives from the Next.js server with a bearer token. Adding CORS would mean
 * opening a public browser-facing surface that has no CSRF story.
 *
 * `sql` is passed in rather than reached for, so a test can hand the routers a
 * transaction it will roll back.
 */
export function createApp(config, sql) {
  const app = express();

  app.use(express.json());

  app.get("/health", (request, response) => {
    response.json({ status: "ok", environment: config.environment });
  });

  app.use("/api/auth", authRouter(sql, config));
  app.use("/api/users", usersRouter(sql, config));

  // Last. Express 5 routes a rejected handler promise here on its own, so no
  // controller needs its own try/catch.
  app.use(errorHandler);

  return app;
}
