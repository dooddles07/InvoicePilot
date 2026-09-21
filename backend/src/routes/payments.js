import { Router } from "express";

import { paymentsController } from "../controllers/payments.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function paymentsRouter(sql, config) {
  const controller = paymentsController(sql);
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.get("/", requirePermission("payment:read"), controller.list);
  router.post("/", requirePermission("payment:write"), controller.create);

  return router;
}
