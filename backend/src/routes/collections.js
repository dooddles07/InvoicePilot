import { Router } from "express";

import { collectionsController } from "../controllers/collections.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function collectionsRouter(sql, config) {
  const controller = collectionsController(sql);
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.get("/pipeline", requirePermission("invoice:read"), controller.pipeline);
  router.get("/queue", requirePermission("invoice:read"), controller.queue);
  router.post("/reminders", requirePermission("invoice:write"), controller.reminders);

  return router;
}
