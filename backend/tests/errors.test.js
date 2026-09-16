import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AuthenticationFailed,
  Conflict,
  DomainError,
  NotFound,
  NotImplemented,
  PermissionDenied,
  ValidationFailed,
  errorHandler,
} from "../src/middleware/errors.js";

function fakeResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    headersSent: false,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const request = { path: "/api/invoices/1" };

describe("the domain error hierarchy", () => {
  it("carries a status and a default detail per class", () => {
    assert.equal(new DomainError().status, 400);
    assert.equal(new NotFound().status, 404);
    assert.equal(new NotFound().detail, "Not found");
    assert.equal(new PermissionDenied().status, 403);
    assert.equal(new ValidationFailed().status, 422);
    assert.equal(new Conflict().status, 409);
  });

  it("takes an overriding detail", () => {
    assert.equal(new Conflict("That email is taken").detail, "That email is taken");
  });

  it("carries a 501 for a route with nothing behind it", () => {
    assert.equal(new NotImplemented().status, 501);
    assert.equal(
      new NotImplemented("Not implemented: nothing yet.").detail,
      "Not implemented: nothing yet.",
    );
  });

  it("fixes the detail of an authentication failure", () => {
    // Deliberately detail-free: distinguishing "expired" from "malformed" from
    // "wrong signature" tells an attacker which guess was closer.
    assert.equal(new AuthenticationFailed("expired token").detail, "Invalid credentials");
    assert.equal(new AuthenticationFailed().status, 401);
  });
});

describe("errorHandler", () => {
  it("answers a domain error with its status and detail", () => {
    const response = fakeResponse();
    errorHandler(new NotFound(), request, response, () => {});
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { detail: "Not found" });
  });

  it("sets WWW-Authenticate on a 401", () => {
    const response = fakeResponse();
    errorHandler(new AuthenticationFailed(), request, response, () => {});
    assert.equal(response.headers["WWW-Authenticate"], "Bearer");
  });

  it("hides an unexpected error behind a request id", (t) => {
    // Stack traces have connection strings in them. The client gets an id that
    // support can search the logs for, and nothing else.
    t.mock.method(console, "error", () => {});
    const response = fakeResponse();
    errorHandler(new Error("postgres://user:hunter2@host"), request, response, () => {});
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.detail, "Internal server error");
    assert.match(response.body.request_id, /^[0-9a-f]{32}$/);
  });

  it("hands a late error back to Express once the response has started", () => {
    const response = { ...fakeResponse(), headersSent: true };
    let handedBack = null;
    const error = new NotFound();
    errorHandler(error, request, response, (passed) => {
      handedBack = passed;
    });
    assert.equal(handedBack, error);
    assert.equal(response.statusCode, null);
  });
});
