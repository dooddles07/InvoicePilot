import { Router } from "express";

import { usersController } from "../controllers/users.js";
import { authenticate } from "../middleware/authenticate.js";

export function usersRouter(sql, config) {
  const controller = usersController(sql);
  const router = Router();

  router.use(authenticate(sql, config.secretKey));
  router.get("/me", controller.me);
  router.patch("/me", controller.updateMe);

  return router;
}
