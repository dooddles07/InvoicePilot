import { Router } from "express";

import { aiController } from "../controllers/ai.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function aiRouter(sql, config) {
  const controller = aiController(sql);
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.post("/analyze", requirePermission("report:read"), controller.analyze);
  router.post("/draft-reminder", requirePermission("invoice:read"), controller.draftReminder);
  router.post("/ask", requirePermission("report:read"), controller.ask);

  return router;
}
