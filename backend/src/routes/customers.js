import { Router } from "express";

import { customersController } from "../controllers/customers.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function customersRouter(sql, config) {
  const controller = customersController(sql);
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.get("/", requirePermission("customer:read"), controller.list);
  router.post("/", requirePermission("customer:write"), controller.create);
  router.get("/:customerId", requirePermission("customer:read"), controller.get);
  router.patch("/:customerId", requirePermission("customer:write"), controller.update);
  router.get(
    "/:customerId/behaviour",
    requirePermission("customer:read"),
    controller.behaviour,
  );
  router.get(
    "/:customerId/events",
    requirePermission("customer:read"),
    controller.events,
  );

  return router;
}
