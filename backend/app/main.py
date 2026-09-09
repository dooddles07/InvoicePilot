from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import (
    ai,
    audit,
    auth,
    automations,
    billing,
    collections,
    customers,
    integrations,
    invoices,
    notifications,
    payments,
    reports,
    users,
    workspaces,
)
from app.core.config import get_settings
from app.core.errors import install_error_handlers

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Connection pools and the background broker are opened here rather than at
    # import time, so a module import never reaches out to the network.
    yield


app = FastAPI(
    title="InvoicePilot API",
    version="0.1.0",
    description=(
        "Accounts receivable automation. Every tenant-scoped route derives its "
        "workspace from the access token, never from the request body."
    ),
    lifespan=lifespan,
    docs_url="/docs" if settings.environment != "production" else None,
)

# No CORS middleware: the browser never calls this service directly. Every
# request arrives from the Next.js server with a bearer token. Adding CORS back
# would mean re-opening a public browser-facing surface that has no CSRF story.
install_error_handlers(app)

for module in (
    auth,
    users,
    workspaces,
    customers,
    invoices,
    payments,
    collections,
    automations,
    notifications,
    reports,
    integrations,
    ai,
    billing,
    audit,
):
    app.include_router(module.router, prefix="/api")


@app.get("/health", tags=["Health"])
def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}
