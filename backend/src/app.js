import express from "express";

import { errorHandler } from "./middleware/errors.js";
import { adminRouter } from "./routes/admin.js";
import { aiRouter } from "./routes/ai.js";
import { apiKeysRouter } from "./routes/apiKeys.js";
import { auditRouter } from "./routes/audit.js";
import { authRouter } from "./routes/auth.js";
import { automationsRouter } from "./routes/automations.js";
import { billingRouter } from "./routes/billing.js";
import { collectionsRouter } from "./routes/collections.js";
import { customersRouter } from "./routes/customers.js";
import { invoicesRouter } from "./routes/invoices.js";
import { notificationsRouter } from "./routes/notifications.js";
import { paymentsRouter } from "./routes/payments.js";
import { reportsRouter } from "./routes/reports.js";
import { usersRouter } from "./routes/users.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { workspacesRouter } from "./routes/workspaces.js";

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

  for (const [path, router] of [
    ["/api/auth", authRouter],
    ["/api/users", usersRouter],
    ["/api/workspaces", workspacesRouter],
    ["/api/customers", customersRouter],
    ["/api/invoices", invoicesRouter],
    ["/api/payments", paymentsRouter],
    ["/api/collections", collectionsRouter],
    ["/api/automations", automationsRouter],
    ["/api/notifications", notificationsRouter],
    ["/api/reports", reportsRouter],
    ["/api/ai", aiRouter],
    ["/api/billing", billingRouter],
    ["/api/audit", auditRouter],
    ["/api/api-keys", apiKeysRouter],
    ["/api/webhooks", webhooksRouter],
    ["/api/admin", adminRouter],
  ]) {
    app.use(path, router(sql, config));
  }

  // Last. Express 5 routes a rejected handler promise here on its own, so no
  // controller needs its own try/catch.
  app.use(errorHandler);

  return app;
}
