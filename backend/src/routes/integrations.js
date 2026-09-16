import { Router } from "express";

import * as controller from "../controllers/integrations.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function integrationsRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.get("/", requirePermission("integration:read"), controller.list);
  router.post(
    "/:provider/connect",
    requirePermission("integration:write"),
    controller.connect,
  );
  router.delete("/:provider", requirePermission("integration:write"), controller.disconnect);
  router.post("/:provider/sync", requirePermission("integration:write"), controller.sync);

  return router;
}
