# InvoicePilot API

Express 5 service behind the InvoicePilot frontend. JavaScript, ESM, no build
step. Six endpoints do real work — signup, login, refresh, logout,
switch-workspace and `GET /api/users/me` — and forty-nine answer `501` so the
endpoint surface matches what the frontend already expects.

## Architecture

```
Frontend (Next.js on Vercel)
      │  JSON over HTTPS, bearer token
      ▼
routes/          paths, guards            src/routes/*.js
      ▼
controllers/     validate, delegate, shape (Zod)
      ▼
services/        business rules, where rules exist (auth only, so far)
      ▼
models/          hand-written SQL, workspace-scoped
      ▼
PostgreSQL       src/sql/*.sql, applied at boot by src/db/migrate.js
```

The view is the React already deployed on Vercel. There is no ORM: the
derivation views (`invoice_state`, `customer_stats`, `collection_queue`) define
every derived value, and the models are thin SQL over them.

## Layout

```
src/
├── server.js       reads config, migrates, listens
├── app.js          express app, routers, error handler last
├── config.js       environment read once, fail fast
├── db/             client, migration runner, demo seeder
├── sql/            0000_schema.sql, 0001_derivation_views.sql
├── middleware/     authenticate, requirePermission, requireAdminToken, errors
├── routes/         15 files, one per domain plus admin
├── controllers/    15 files
├── models/         14 files
├── services/       auth.js
└── lib/            security.js — argon2, JWT, refresh tokens, ROLE_PERMISSIONS
```

## Three decisions worth knowing

**1. The workspace comes from the token.** `Principal.workspaceId` is read from
the signed access token, never from a body, a query string or a path segment,
so a caller cannot widen their own scope by editing a URL. Cross-tenant reads
answer `404`, not `403`: a `403` confirms the record exists.

**2. Money is integer minor units.** `amount_cents`, `paid_cents` and
`balance_cents` are `bigint`. postgres.js returns `int8` as a string, so
`src/db/index.js` parses it to a number once, asserting it fits
`Number.MAX_SAFE_INTEGER`. Deciding that per query is how one screen formats
`"120000"` as a string.

**3. A service never opens its own transaction.** It takes a handle. The
controller wraps a multi-statement use case in `transaction(sql, fn)`; a test
hands the same function a transaction it rolls back. Atomicity is identical and
the service is testable without a commit.

## Running it

```bash
cd backend
npm ci

export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/invoicepilot"
export SECRET_KEY="dev-only-at-least-thirty-two-characters"

npm start          # migrates, then listens on 3001
curl localhost:3001/health
```

## Tests

`node:test`, against a real PostgreSQL whose database name contains `test` —
the harness refuses anything else, because it drops and recreates the `public`
schema.

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/invoicepilot_test"
npm test
```

## The demo workspace

```bash
npm run seed -- --email demo@example.com --password "…"
```

Prints the workspace id; set it as `DEMO_WORKSPACE_ID` on both services.
`POST /api/admin/reseed`, guarded by `X-Admin-Token`, rebuilds that one
workspace and only that one. The ledger is deterministic: the same seed value
every time, anchored to the day it runs.

## Environment

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon's **pooled** connection string in production |
| `SECRET_KEY` | HS256 signing key, ≥ 32 characters, no default |
| `PORT` | Render sets it; 3001 locally |
| `ADMIN_TOKEN` | Guards `POST /api/admin/reseed`, ≥ 32 characters |
| `DEMO_WORKSPACE_ID` | The only workspace the reseed may touch |

## Frontend contract

`src/types/index.ts` in the frontend mirrors these response shapes field for
field, snake_case included, and `src/lib/api/client.ts` parses every response
with Zod at the boundary. JavaScript gives the backend no type contract to
export, so that parse is what fails loudly when a field is renamed.
