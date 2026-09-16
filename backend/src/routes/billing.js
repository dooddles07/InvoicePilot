import { Router } from "express";

import * as controller from "../controllers/billing.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function billingRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.get("/subscription", controller.subscription);
  // billing:write is granted by no role, so only owner reaches this, through
  // the wildcard. Ported as it is: a hosting change that quietly widens a
  // permission is a defect, and fixing it is a separate decision.
  router.post("/subscription", requirePermission("billing:write"), controller.changePlan);
  router.get("/invoices", controller.invoices);

  return router;
}
