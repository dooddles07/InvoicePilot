import { Router } from "express";

import { collectionsController } from "../controllers/collections.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function collectionsRouter(sql, config) {
  const controller = collectionsController(sql, config);
  const router = Router();
  router.use(authenticate(sql, config.secretKey));

  router.get("/pipeline", requirePermission("invoice:read"), controller.pipeline);
  router.get("/queue", requirePermission("invoice:read"), controller.queue);
  router.get("/insights", requirePermission("invoice:read"), controller.insights);
  router.get("/summary", requirePermission("invoice:read"), controller.summary);
  router.post("/reminders", requirePermission("invoice:write"), controller.reminders);

  return router;
}
