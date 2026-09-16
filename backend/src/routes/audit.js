import { Router } from "express";

import * as controller from "../controllers/audit.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function auditRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.get("/", requirePermission("audit:read"), controller.list);

  return router;
}
