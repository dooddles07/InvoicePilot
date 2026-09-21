import { Router } from "express";

import { auditController } from "../controllers/audit.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function auditRouter(sql, config) {
  const controller = auditController(sql);
  const router = Router();
  router.use(authenticate(sql, config.secretKey));

  router.get("/", requirePermission("audit:read"), controller.list);

  return router;
}
