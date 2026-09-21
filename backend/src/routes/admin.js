import { Router } from "express";

import { adminController } from "../controllers/admin.js";
import { requireAdminToken } from "../middleware/admin-token.js";

/**
 * Not mounted behind `authenticate`: this is called by the Vercel cron
 * handler, which holds a shared secret rather than a session.
 */
export function adminRouter(sql, config) {
  const controller = adminController(sql, config);
  const router = Router();

  router.post("/reseed", requireAdminToken(config), controller.reseed);
  router.post("/run-daily", requireAdminToken(config), controller.runDaily);

  return router;
}
