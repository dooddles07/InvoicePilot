import { Router } from "express";

import { authController } from "../controllers/auth.js";
import { authenticate } from "../middleware/authenticate.js";

export function authRouter(sql, config) {
  const controller = authController(sql, config);
  const router = Router();

  // Signup, login and refresh are how a caller gets a token, so none of them
  // can require one. Logout takes the refresh token in its body, not the
  // access token in a header: a session whose access token has already expired
  // must still be endable.
  router.post("/signup", controller.signup);
  router.post("/login", controller.login);
  router.post("/refresh", controller.refresh);
  router.post("/logout", controller.logout);
  router.post(
    "/switch-workspace",
    authenticate(sql, config.secretKey),
    controller.switchWorkspace,
  );
  // Guarded by nothing, as in app/api/routes/auth.py.
  router.post("/password-reset", controller.passwordReset);

  return router;
}
