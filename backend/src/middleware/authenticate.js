/**
 * Bearer token to Principal.
 *
 * The service accepts `Authorization: Bearer` and nothing else. It reads no
 * cookie, which is what makes a cross-site request unable to drive it: the
 * attacker's page cannot read the httpOnly cookie the browser holds, and this
 * API does not accept one.
 *
 * Ported from the get_principal half of app/api/deps.py.
 */
import { decodeAccessToken } from "../lib/security.js";
import { AuthenticationFailed } from "./errors.js";

export function authenticate(secretKey) {
  return async function authenticateRequest(request, response, next) {
    const [scheme, token] = (request.get("authorization") ?? "").split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new AuthenticationFailed();
    }

    try {
      request.principal = await decodeAccessToken(token, secretKey);
    } catch {
      // Uniform whatever the cause. Distinguishing "expired" from "malformed"
      // from "wrong signature" tells an attacker which guess was closer.
      throw new AuthenticationFailed();
    }

    next();
  };
}
