import { Router } from "express";

import * as controller from "../controllers/reports.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function reportsRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));
  router.use(requirePermission("report:read"));

  router.get("/aging", controller.aging);
  router.get("/cash-flow", controller.cashFlow);
  router.get("/collection-rate", controller.collectionRate);
  router.get("/customer-risk", controller.customerRisk);
  router.get("/days-to-payment", controller.daysToPayment);

  return router;
}
