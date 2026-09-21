import { Router } from "express";

import { webhooksController } from "../controllers/webhooks.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function webhooksRouter(sql, config) {
  const controller = webhooksController(sql);
  const router = Router();
  router.use(authenticate(sql, config.secretKey));

  router.get("/", requirePermission("integration:read"), controller.list);
  router.post("/", requirePermission("integration:write"), controller.create);
  router.delete("/:endpointId", requirePermission("integration:write"), controller.remove);
  router.post("/:endpointId/test", requirePermission("integration:write"), controller.sendTest);

  return router;
}
