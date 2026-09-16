/**
 * The guard on the one endpoint that deletes data.
 *
 * Constant-time, because a token compared with === leaks its prefix to anyone
 * willing to measure. Fails closed when the service has no token configured:
 * an unset ADMIN_TOKEN must not mean "no check".
 *
 * Deliberately not `authenticate`: this is a machine-to-machine secret, not a
 * session, and it carries no principal and no workspace.
 */
import { timingSafeEqual } from "node:crypto";

import { AuthenticationFailed } from "./errors.js";

export function requireAdminToken(config) {
  return function requireAdminTokenOnRequest(request, response, next) {
    if (!config.adminToken || !config.demoWorkspaceId) {
      throw new AuthenticationFailed();
    }

    const provided = Buffer.from(request.get("x-admin-token") ?? "", "utf8");
    const expected = Buffer.from(config.adminToken, "utf8");
    // timingSafeEqual throws on unequal lengths, so length is checked first.
    // That leaks the token's length and nothing else.
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      throw new AuthenticationFailed();
    }

    next();
  };
}
