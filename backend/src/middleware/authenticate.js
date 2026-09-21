/**
 * Bearer token to Principal.
 *
 * The service accepts `Authorization: Bearer` and nothing else. It reads no
 * cookie, which is what makes a cross-site request unable to drive it: the
 * attacker's page cannot read the httpOnly cookie the browser holds, and this
 * API does not accept one.
 *
 * Two credential shapes share the header: a JWT from the login flow, and an
 * api_keys secret for a server-to-server caller. The prefix tells them apart
 * before either is parsed, so a malformed JWT never gets tried as a key hash
 * or vice versa.
 *
 * Ported from the get_principal half of app/api/deps.py.
 */
import { authenticateApiKey, API_KEY_PREFIX } from "../models/apiKeys.js";
import { decodeAccessToken } from "../lib/security.js";
import { AuthenticationFailed } from "./errors.js";

export function authenticate(sql, secretKey) {
  return async function authenticateRequest(request, response, next) {
    const [scheme, token] = (request.get("authorization") ?? "").split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new AuthenticationFailed();
    }

    if (token.startsWith(API_KEY_PREFIX)) {
      const principal = await authenticateApiKey(sql, token);
      if (!principal) throw new AuthenticationFailed();
      request.principal = principal;
      return next();
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
