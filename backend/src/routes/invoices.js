import { Router } from "express";

import { invoicesController } from "../controllers/invoices.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function invoicesRouter(sql, config) {
  const controller = invoicesController(sql, config);
  const router = Router();
  router.use(authenticate(sql, config.secretKey));

  router.get("/", requirePermission("invoice:read"), controller.list);
  router.post("/", requirePermission("invoice:write"), controller.create);
  router.get("/:invoiceId", requirePermission("invoice:read"), controller.get);
  router.patch("/:invoiceId", requirePermission("invoice:write"), controller.update);
  router.post("/:invoiceId/send", requirePermission("invoice:write"), controller.send);
  router.get("/:invoiceId/events", requirePermission("invoice:read"), controller.events);

  return router;
}
