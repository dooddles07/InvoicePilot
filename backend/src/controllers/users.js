import { notImplemented } from "./not-implemented.js";
import * as auth from "../services/auth.js";

export function usersController(sql) {
  return {
    async me(request, response) {
      response.json(await auth.describe(sql, request.principal));
    },

    updateMe: notImplemented,
  };
}
