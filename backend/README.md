# InvoicePilot API

FastAPI service behind the InvoicePilot frontend. This is an **architecture
skeleton**: the routes, models, schemas and boundaries are real and the OpenAPI
document is complete, but the service layer is not wired — every endpoint
returns `501`. Nothing here pretends to work.

## Architecture

```
Frontend (Next.js)
      │  JSON over HTTPS, bearer token
      ▼
FastAPI routers          app/api/routes/*.py     validation, authz, shape
      ▼
Service layer            app/services/           business rules, transactions
      ▼
Repositories             app/repositories/       every query is workspace-scoped
      ▼
PostgreSQL               app/models/             SQLAlchemy 2.0, Alembic

Background: Dramatiq + Redis (app/workers/) for reminder sends, integration
syncs and nightly risk scoring — anything that must not happen inside a request.
```

## Layout

```
app/
├── api/routes/     14 route modules, one per domain
├── core/           config, security, JWT, RBAC
├── models/         SQLAlchemy models, workspace-scoped base
├── schemas/        Pydantic request/response models
├── services/       business rules
├── repositories/   data access, tenancy enforced here
├── workers/        Dramatiq actors
├── integrations/   QuickBooks, Xero, Stripe, Gmail, Twilio adapters
├── ai/             AI service interface and deterministic fallback
└── main.py         app factory and router registration
```

## Three decisions worth knowing

**1. Multi-tenancy is enforced in one place.**
`WorkspaceRepository._query()` is the only way to build a statement, and it
always applies `workspace_id`. Endpoints never write the filter, so they cannot
forget it. `workspace_id` comes from the access token, not the request body — a
caller cannot widen their own scope by editing a payload. Every tenant table
carries a composite index leading with `workspace_id`.

**2. Money is integer minor units.**
`amount_cents`, `paid_cents`, `balance_cents` — `BigInteger`, never `Float` or
`Numeric` in the API contract. Float dollars do not survive arithmetic, and a
rounding error in a receivables ledger ends in a manual reconciliation.

**3. The AI layer cannot act.**
`app/ai/service.py` returns `Recommendation` objects. There is no `execute`
method. A separate, human-confirmed endpoint performs the action and writes the
audit entry:

```
AI recommendation  →  human confirmation  →  action  →  audit log
```

With `AI_PROVIDER=disabled` the product still works: rankings fall back to a
deterministic expected-recovery score (`balance × risk weight × exp(-days/55)`)
computed in SQL. That is also the baseline any model-backed provider must beat.

## Entities

`users`, `workspaces`, `workspace_members`, `customers`, `invoices`,
`invoice_items`, `payments`, `payment_methods`, `collection_events`,
`communication_logs`, `automations`, `automation_steps`, `automation_runs`,
`email_templates`, `notifications`, `integrations`, `ai_insights`,
`audit_logs`, `subscriptions`.

## Security

- Bearer JWT access tokens (30 min) with rotating refresh tokens (14 days)
- Argon2id password hashing
- RBAC as data in `core/security.py` — `owner`, `admin`, `member`, `viewer` —
  guarded per route with `Depends(require("invoice:write"))`
- Uniform `401` for every token failure, so responses do not tell an attacker
  which guess was closer
- Per-identity rate limiting applied before authentication
- HMAC-SHA256 signed webhooks, compared in constant time against the raw body,
  with a five-minute timestamp window to stop replay
- Audit log on every action that changes a record or contacts a customer

## Running it

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

export SECRET_KEY="dev-only-not-for-production"
export DATABASE_URL="postgresql+psycopg://invoicepilot:invoicepilot@localhost:5432/invoicepilot"
export REDIS_URL="redis://localhost:6379/0"

alembic upgrade head
uvicorn app.main:app --reload        # http://localhost:8000/docs
```

Verify the surface without a database:

```bash
python -c "from app.main import app; print(len(app.routes), 'routes')"
```

## Frontend contract

`src/types/index.ts` in the frontend mirrors these Pydantic schemas
field-for-field, snake_case included. Replacing the demo fixtures with this API
is a change of data source, not a rewrite of the UI.
