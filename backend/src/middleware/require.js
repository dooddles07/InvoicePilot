/**
 * Guard a route with a single named permission.
 *
 * Mounted after `authenticate`, never instead of it: with no principal on the
 * request this fails closed rather than reading `undefined.can`.
 *
 * Ported from the require() factory in app/api/deps.py.
 */
import { PermissionDenied } from "./errors.js";

export function requirePermission(permission) {
  return function requirePermissionOnRequest(request, response, next) {
    if (!request.principal?.can(permission)) {
      throw new PermissionDenied(`Requires ${permission}`);
    }
    next();
  };
}
