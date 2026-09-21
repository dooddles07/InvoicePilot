import { Router } from "express";

import { automationsController } from "../controllers/automations.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function automationsRouter(sql, config) {
  const controller = automationsController(sql);
  const router = Router();
  router.use(authenticate(sql, config.secretKey));

  router.get("/", requirePermission("automation:read"), controller.list);
  router.post("/", requirePermission("automation:write"), controller.create);
  router.get("/:automationId", requirePermission("automation:read"), controller.get);
  router.patch("/:automationId", requirePermission("automation:write"), controller.update);
  router.get("/:automationId/runs", requirePermission("automation:read"), controller.runs);

  return router;
}
