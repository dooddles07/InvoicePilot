import { Router } from "express";

import * as controller from "../controllers/workspaces.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require.js";

export function workspacesRouter(sql, config) {
  const router = Router();
  router.use(authenticate(config.secretKey));

  router.get("/", controller.list);
  router.post("/", controller.create);
  router.get("/:workspaceId", controller.get);
  router.patch("/:workspaceId", requirePermission("workspace:write"), controller.update);
  router.get("/:workspaceId/members", requirePermission("team:write"), controller.members);
  router.post("/:workspaceId/members", requirePermission("team:write"), controller.invite);

  return router;
}
