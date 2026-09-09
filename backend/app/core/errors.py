"""Domain errors and the single place they become HTTP.

Services raise these; routes never catch them. That keeps a route to
"validate, delegate, shape" and keeps the status-code policy -- especially
"cross-tenant is 404, not 403" -- in one readable place.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("invoicepilot.errors")


class DomainError(Exception):
    status_code: int = 400
    default_detail: str = "Request failed"

    def __init__(self, detail: str | None = None) -> None:
        self.detail = detail or self.default_detail
        super().__init__(self.detail)


class NotFound(DomainError):
    """Also raised for a record in another workspace.

    Answering 403 there would confirm the record exists, which turns a list of
    guessed ids into a census of another tenant's data.
    """

    status_code = 404
    default_detail = "Not found"


class PermissionDenied(DomainError):
    status_code = 403
    default_detail = "Not permitted"


class AuthenticationFailed(DomainError):
    """Deliberately detail-free: the message is fixed, whatever the cause."""

    status_code = 401
    default_detail = "Invalid credentials"

    def __init__(self, detail: str | None = None) -> None:  # noqa: ARG002
        super().__init__(self.default_detail)


class ValidationFailed(DomainError):
    status_code = 422
    default_detail = "Invalid request"


class Conflict(DomainError):
    status_code = 409
    default_detail = "Already exists"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain(request: Request, exc: DomainError) -> JSONResponse:
        headers = (
            {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
        )
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail}, headers=headers
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # Logged with an id so support can find this exact request; the client
        # gets the id and nothing else. Stack traces have connection strings in
        # them.
        request_id = uuid.uuid4().hex
        logger.exception(
            "unhandled error request_id=%s path=%s", request_id, request.url.path
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "request_id": request_id},
        )
