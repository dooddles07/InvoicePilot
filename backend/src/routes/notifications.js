import { Router } from "express";

import * as controller from "../controllers/notifications.js";
import { authenticate } from "../middleware/authenticate.js";

export function notificationsRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));

  // Guarded by a bearer token and nothing more: a notification is addressed to
  // the caller, so there is no role that should see someone else's.
  router.get("/", controller.list);
  router.post("/read", controller.markRead);
  router.get("/preferences", controller.preferences);
  router.put("/preferences", controller.replacePreferences);

  return router;
}
