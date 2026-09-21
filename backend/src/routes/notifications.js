import { Router } from "express";

import { notificationsController } from "../controllers/notifications.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function notificationsRouter(sql, config) {
  const controller = notificationsController(sql);
  const router = Router();
  router.use(authenticate(sql, config.secretKey));

  // Guarded by a bearer token and nothing more: a notification is addressed to
  // the caller, so there is no role that should see someone else's.
  router.get("/", controller.list);
  router.post("/read", controller.markRead);
  router.get("/preferences", controller.preferences);
  router.put("/preferences", controller.replacePreferences);
  // Workspace config, not personal -- guarded like the rest of invoicing.
  router.get("/templates", requirePermission("invoice:read"), controller.templates);

  return router;
}
