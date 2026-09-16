import { Router } from "express";

import * as controller from "../controllers/ai.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function aiRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.post("/analyze", requirePermission("report:read"), controller.analyze);
  router.post("/draft-reminder", requirePermission("invoice:read"), controller.draftReminder);
  router.post("/ask", requirePermission("report:read"), controller.ask);

  return router;
}
