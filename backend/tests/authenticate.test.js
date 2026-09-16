import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { authenticate } from "../src/middleware/authenticate.js";
import { requirePermission } from "../src/middleware/require.js";
import {
  AuthenticationFailed,
  PermissionDenied,
} from "../src/middleware/errors.js";
import { issueAccessToken, makePrincipal } from "../src/lib/security.js";

const SECRET = "test-only-key-that-is-long-enough-for-hs256";
const USER = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";

function fakeRequest(authorization) {
  return {
    path: "/api/users/me",
    get(name) {
      return name.toLowerCase() === "authorization" ? authorization : undefined;
    },
  };
}

async function tokenFor(role) {
  return issueAccessToken(makePrincipal(USER, WORKSPACE, role), SECRET);
}

describe("authenticate", () => {
  it("puts the principal on the request and continues", async () => {
    const request = fakeRequest(`Bearer ${await tokenFor("admin")}`);
    let continued = false;

    await authenticate(SECRET)(request, {}, () => {
      continued = true;
    });

    assert.equal(continued, true);
    assert.equal(request.principal.userId, USER);
    assert.equal(request.principal.workspaceId, WORKSPACE);
    assert.equal(request.principal.role, "admin");
  });

  it("accepts the scheme in any case", async () => {
    const request = fakeRequest(`bearer ${await tokenFor("viewer")}`);
    await authenticate(SECRET)(request, {}, () => {});
    assert.equal(request.principal.role, "viewer");
  });

  it("rejects a missing header with 401, not FastAPI's 403", async () => {
    // Deliberate divergence from HTTPBearer(auto_error=True), which answers
    // 403 for an absent header. 401 with WWW-Authenticate is what RFC 7235
    // specifies and what src/lib/api/session.ts reads as "signed out".
    await assert.rejects(
      () => authenticate(SECRET)(fakeRequest(undefined), {}, () => {}),
      AuthenticationFailed,
    );
  });

  it("rejects a header that is not a bearer scheme", async () => {
    await assert.rejects(
      () => authenticate(SECRET)(fakeRequest("Basic abc123"), {}, () => {}),
      AuthenticationFailed,
    );
  });

  it("rejects a token signed with another key", async () => {
    const token = await issueAccessToken(
      makePrincipal(USER, WORKSPACE, "owner"),
      "a-different-key-that-is-also-long-enough-!!",
    );
    await assert.rejects(
      () => authenticate(SECRET)(fakeRequest(`Bearer ${token}`), {}, () => {}),
      AuthenticationFailed,
    );
  });

  it("answers a malformed token exactly as it answers a forged one", async () => {
    // Uniform on purpose: distinguishing "expired" from "malformed" from
    // "wrong signature" tells an attacker which of their guesses was closer.
    const failures = [];
    for (const header of ["Bearer", "Bearer not.a.jwt", "Bearer "]) {
      await authenticate(SECRET)(fakeRequest(header), {}, () => {}).catch(
        (error) => failures.push(error.detail),
      );
    }
    assert.deepEqual(failures, [
      "Invalid credentials",
      "Invalid credentials",
      "Invalid credentials",
    ]);
  });
});

describe("requirePermission", () => {
  it("continues when the principal has the permission", () => {
    const request = { principal: makePrincipal(USER, WORKSPACE, "member") };
    let continued = false;
    requirePermission("invoice:write")(request, {}, () => {
      continued = true;
    });
    assert.equal(continued, true);
  });

  it("names the permission it refused", () => {
    const request = { principal: makePrincipal(USER, WORKSPACE, "viewer") };
    assert.throws(
      () => requirePermission("invoice:write")(request, {}, () => {}),
      (error) => {
        assert.ok(error instanceof PermissionDenied);
        assert.equal(error.status, 403);
        assert.equal(error.detail, "Requires invoice:write");
        return true;
      },
    );
  });

  it("refuses when nothing authenticated the request", () => {
    // Belt and braces: a router that mounts the guard without authenticate
    // first is a bug, and it must fail closed.
    assert.throws(
      () => requirePermission("invoice:read")({}, {}, () => {}),
      PermissionDenied,
    );
  });
});
