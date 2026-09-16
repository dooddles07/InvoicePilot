/**
 * Domain errors and the single place they become HTTP.
 *
 * Services throw these; controllers never catch them. That keeps a controller
 * to "validate, delegate, shape" and keeps the status-code policy -- especially
 * "cross-tenant is 404, not 403" -- in one readable place.
 *
 * Ported from app/core/errors.py.
 */
import { randomUUID } from "node:crypto";

export class DomainError extends Error {
  static status = 400;
  static defaultDetail = "Request failed";

  constructor(detail) {
    super(detail ?? new.target.defaultDetail);
    this.name = new.target.name;
    this.status = new.target.status;
    this.detail = this.message;
  }
}

/**
 * Also thrown for a record in another workspace. Answering 403 there would
 * confirm the record exists, which turns a list of guessed ids into a census of
 * another tenant's data.
 */
export class NotFound extends DomainError {
  static status = 404;
  static defaultDetail = "Not found";
}

export class PermissionDenied extends DomainError {
  static status = 403;
  static defaultDetail = "Not permitted";
}

/** Deliberately detail-free: the message is fixed, whatever the cause. */
export class AuthenticationFailed extends DomainError {
  static status = 401;
  static defaultDetail = "Invalid credentials";

  constructor() {
    super(AuthenticationFailed.defaultDetail);
  }
}

export class ValidationFailed extends DomainError {
  static status = 422;
  static defaultDetail = "Invalid request";
}

export class Conflict extends DomainError {
  static status = 409;
  static defaultDetail = "Already exists";
}

export function errorHandler(error, request, response, next) {
  // Express cannot change a response it has already started sending, so a late
  // error goes to the default handler, which closes the connection.
  if (response.headersSent) return next(error);

  if (error instanceof DomainError) {
    if (error.status === 401) response.set("WWW-Authenticate", "Bearer");
    return response.status(error.status).json({ detail: error.detail });
  }

  // Logged with an id so support can find this exact request; the client gets
  // the id and nothing else. Stack traces have connection strings in them.
  const requestId = randomUUID().replaceAll("-", "");
  console.error(
    `unhandled error request_id=${requestId} path=${request.path}`,
    error,
  );
  return response
    .status(500)
    .json({ detail: "Internal server error", request_id: requestId });
}
