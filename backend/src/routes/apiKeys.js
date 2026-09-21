import { Router } from "express";

import { apiKeysController } from "../controllers/apiKeys.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function apiKeysRouter(sql, config) {
  const controller = apiKeysController(sql);
  const router = Router();
  router.use(authenticate(sql, config.secretKey));

  router.get("/", requirePermission("apikey:write"), controller.list);
  router.post("/", requirePermission("apikey:write"), controller.create);
  router.delete("/:keyId", requirePermission("apikey:write"), controller.revoke);

  return router;
}
