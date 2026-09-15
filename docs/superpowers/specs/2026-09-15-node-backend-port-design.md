# InvoicePilot — Node Backend Port

**Date:** 2026-09-15
**Status:** superseded by `docs/superpowers/specs/2026-09-15-express-backend-port-design.md`. Phase P1 shipped; its SQL carries into the Express port, its TypeScript does not.
**Supersedes:** large parts of `docs/superpowers/specs/2026-09-11-free-tier-deployment-and-phases-3-6-design.md` (see §10)

---

## 1. Context

The backend is a FastAPI service in `backend/`: 61 Python files, 4,122 lines
outside `.venv`. Only one subsystem does real work. `backend/README.md` states
it plainly — the routes, models and schemas are real, the service layer is not
wired, and every endpoint returns `501`. Two exceptions have landed since:
authentication (`app/services/auth.py`, 287 lines) and the schema, including
three Alembic migrations and a set of SQL derivation views.

Everything else — invoices, customers, payments, collections, reports, audit,
AI, billing, automations, integrations, notifications, users, workspaces — is a
function signature with an RBAC guard and a `501`.

The frontend is Next.js 16 with React 19. It reaches the backend through
exactly two places: `src/lib/api/client.ts` and `src/proxy.ts`.

This port replaces the Python service with TypeScript Route Handlers inside the
existing Next application. It changes the host and the language. It does not
change the schema, the permission model, the session design, or the product.

**Why now.** Roughly ninety per cent of the backend is shape rather than
behaviour, so the port is as cheap as it will ever be. Every phase that lands
first makes it more expensive.

**Why at all.** One language, one deployment, one dependency tree, and database
types inferred once instead of mirrored by hand between Pydantic schemas and
`src/types/index.ts`.

---

## 2. Decisions

| # | Decision | Consequence |
|---|---|---|
| 1 | The backend moves into the Next application as Route Handlers | One service, one deploy, one language. `backend/` is deleted. |
| 2 | No Express | Next is already the Node server. A second HTTP server adds a router, a deploy and a process without adding a capability. |
| 3 | `route.ts` is the controller | MVC without an empty forwarding layer: `route.ts` validates and delegates, `services/` holds rules, `models/` and `repositories/` hold data. |
| 4 | Drizzle ORM, with the three migrations ported as raw SQL | Query types are inferred and shared with the frontend. The derivation views survive verbatim rather than being re-expressed in a DSL. |
| 5 | Only working code is ported | Auth, security, schema, migrations and the seeder move. The stub route modules are deleted, not translated. |
| 6 | Handlers authenticate by `Authorization` header only, never by reading the session cookie | Preserves today's property: a cross-site request cannot drive the API, because the browser has nothing to attach automatically. |
| 7 | A frontend test framework is now required | This reverses decision 10 of the free-tier spec. Its premise — that every data rule worth testing lives in Python — stops being true the moment the ledger rules are TypeScript. |
| 8 | One Vercel service, so no service binding and no private-backend topology | Decisions 1–4 of the free-tier spec dissolve. §12 of this document covers what is lost with them. |

---

## 3. What moves, what dies

**Ported**

| Source | Lines | Becomes |
|---|---|---|
| `app/services/auth.py` | 287 | `src/server/services/auth.ts` |
| `app/core/security.py` | 109 | `src/server/security.ts` |
| `app/models/*.py` | ~325 | `src/server/models/schema.ts` |
| `migrations/versions/000{1,2,3}_*.py` | 715 | `drizzle/000{1,2,3}_*.sql` |
| `app/seeds/demo.py` | 401 | merged into `src/lib/data/seed.ts` |
| `app/core/errors.py` | 61 | `src/server/errors.ts` |
| `tests/*.py` | 12 files | `src/server/**/*.test.ts` |

**Deleted**

- `backend/` in full, including the 17 route modules and every `501` handler.
- Dramatiq and Redis. The free-tier spec already removed them from the running
  system; this removes the code.
- The `backend` service and the `/api/backend` rewrite in `vercel.json`.

The OpenAPI document is lost with the stub routes. It described endpoints that
returned `501`, so what is lost is a contract for unwritten behaviour. Each
phase writes its handler and its types together from then on.

---

## 4. Layout

```
src/
├── app/api/
│   ├── auth/{signup,login,refresh,logout,switch-workspace}/route.ts
│   └── <domain>/route.ts            added by the phase that implements it
├── server/
│   ├── db.ts                        postgres.js client
│   ├── security.ts                  hashing, tokens, Principal, RBAC
│   ├── errors.ts                    ApiError to Response
│   ├── models/schema.ts             Drizzle tables
│   ├── repositories/                workspace-scoped queries
│   └── services/                    business rules, transactions
└── lib/                             unchanged: the frontend
drizzle/                             SQL migrations
```

MVC maps as: `route.ts` is the controller, `services/` plus `repositories/`
plus `models/` are the model, and the React components already in
`src/components/` are the view. Route files stay thin — validate, authorize,
delegate, shape — which is what `app/api/routes/auth.py` already documents in
its header comment.

`src/server/` is server-only by construction. Every module in it imports
`server-only`, which is already a dependency, so an accidental client import
fails the build instead of shipping a database client to a browser.

---

## 5. Auth and security

This is the only subsystem with real logic, and it is the only part of the port
carrying real risk. The Python behaviour is reproduced exactly.

- **Passwords: Argon2id**, via `@node-rs/argon2`. Not bcrypt. A password
  hashing change is not part of a hosting change.
- **Access tokens: HS256 JWT**, via `jose`. Not hand-rolled. The claim set is
  unchanged: `sub`, `ws`, `role`, `iat`, `exp`, thirty-minute expiry.
- **Refresh tokens stay opaque** — 32 random bytes from `node:crypto`, looked up
  by SHA-256 digest. `app/core/security.py:124-133` explains why this one is not
  Argon2: it is on the hot path of every refresh, and a 300 ms key derivation
  there is a self-inflicted denial of service. That reasoning ports with the
  code.
- **`ROLE_PERMISSIONS` ports verbatim** as a frozen object — data, not
  branching, still readable in one place and testable without a request.
- **`Principal` keeps `workspace_id` from the token.** Repositories take the
  workspace from the principal and never from a URL or body, so a caller cannot
  widen their own scope. `WorkspaceRepository._query()` becomes
  `workspaceScoped()`, and remains the only way to build a statement.
- **Uniform `401`** for every token failure, unchanged.

### Why handlers do not read cookies

Today the browser holds `ip_at` and `ip_rt` as httpOnly cookies, a Server
Action reads the access token, and FastAPI receives it as a bearer token. A
cross-site request cannot reproduce that, because the attacker's page cannot
read the cookie and the API does not accept one.

Collapsing the API onto the application's own origin would break that property
if handlers started trusting the cookie directly: the browser attaches
same-site cookies to requests the page did not intend. `sameSite: "lax"` in
`src/lib/auth/cookies.ts:22` blocks the obvious cross-site POST, but it is one
setting standing where an architectural boundary used to stand.

So handlers read `Authorization: Bearer <token>` and nothing else.
`readAccessToken()` stays in the Server Action layer, exactly where it is now.

---

## 6. Data layer

**Driver.** `postgres.js` against Neon's pooled endpoint, configured `max: 1`
and `prepare: false`. This is the Node equivalent of the free-tier spec's
`NullPool` decision — a serverless function should not hold a pool, and
PgBouncer in transaction mode rejects prepared statements.

**Schema.** Drizzle table definitions in `src/server/models/schema.ts`, matching
the existing tables column for column. Money stays `bigint` minor units —
`amount_cents`, `paid_cents`, `balance_cents` — never a float, per decision 2 of
the backend README.

**Migrations.** The three Alembic migrations are translated to SQL once and then
frozen. `0003_derivation_views` is already SQL in all but syntax and moves
across unchanged. New migrations from this point are generated by
`drizzle-kit`.

**Types.** Drizzle infers row types from the schema. `src/types/index.ts` stops
being a hand-maintained mirror of Pydantic models and starts being derived —
which removes the failure its own header comment warns about, a backend field
rename surfacing as `undefined` inside a currency formatter three screens away.

**Transactions.** Payment application and any other multi-statement write run
inside `db.transaction()`. The ledger invariants that `test_ledger_invariants`
protects are transactional invariants; they do not survive being split into
separate statements.

---

## 7. Seeder

`app/seeds/demo.py` (401 lines) and `src/lib/data/seed.ts` (653 lines) build the
same demo dataset twice, in two languages, from two seeded random number
generators. The port collapses them into one TypeScript seeder that writes to
Postgres, with `src/lib/data/` continuing to serve fixtures to the six parked
preview screens until phase 6 removes them.

`app/seeds/rng.py` ports alongside it. The seed value stays fixed, because a
demo workspace that differs between reseeds makes screenshots and bug reports
disagree with each other.

---

## 8. Frontend wiring

Two call sites change, and only two.

**`src/lib/api/client.ts`** — `BASE_URL` becomes same-origin. The signature of
`apiFetch`, its Zod parsing, its `no-store` policy and `handleReadError` are
untouched, so no caller changes.

Future read-path modules under `src/lib/api/` call services in `src/server/`
directly rather than fetching the application's own URL. A server-to-self HTTP
request on Vercel costs a network round trip and a second function invocation to
move data between two functions in the same deployment.

**`src/proxy.ts`** — keeps both of its jobs, including the refresh rotation,
and its `fetch` becomes same-origin:

```ts
await fetch(new URL("/api/auth/refresh", request.url), { ... })
```

The free-tier spec moved rotation out of the proxy and into
`/api/session/refresh` because service bindings do not resolve in middleware.
With one service there is no binding, so that constraint disappears and the
existing rotation code stays where it is. The optimistic-check-only contract in
the proxy's header comment still holds: authorization is verified in the
handler, on every request, and a forged cookie earns a `401`.

---

## 9. Deployment

One Vercel project, one service, one Neon database.

`vercel.json` reduces to its cron entry:

```json
{
  "crons": [{ "path": "/api/cron/reseed", "schedule": "0 4 * * *" }]
}
```

Environment variables: `DATABASE_URL` (Neon pooled), `SECRET_KEY`,
`DEMO_WORKSPACE_ID`, `ADMIN_TOKEN`. `API_BASE_URL` is deleted — there is no
second service to address.

Migrations run with `drizzle-kit migrate` against Neon's direct, unpooled
connection string, the same split the free-tier spec specified for Alembic.

---

## 10. What this supersedes

From `2026-09-11-free-tier-deployment-and-phases-3-6-design.md`:

| Superseded | Why |
|---|---|
| Decision 1, two services | One service now. |
| Decision 2, backend gets no public rewrite | There is no separate backend to keep unroutable. See §12. |
| Decision 3, service binding injects `API_BASE_URL` | No binding. Same-origin. |
| Decision 4, refresh moves out of `proxy.ts` | The constraint that forced it was the binding. Rotation stays in the proxy. |
| Decision 10, no frontend test framework | Its premise was that every data rule lives in Python. |
| §3 topology and `vercel.json` | Replaced by §9 above. |
| §10 verification, `pytest` | Replaced by §11 below. |
| Phase 0 | Replaced by the build order in §13. |

**Survives unchanged:** decision 5 (six screens stay banner-parked), decision 6
(one-click demo login, seated as admin), decision 7 (daily cron reseed),
decision 8 (email is an outbox with no provider), decision 9 (deploy the
working spine before building phases 3–6), and the acceptance criteria of
phases 3 through 6. Those phases change language, not shape.

Both earlier plans, `2026-09-08-schema-views-and-seeder.md` and
`2026-09-09-auth-and-session.md`, remain complete and merged. Their output —
the schema and the session design — is what this port carries across.

---

## 11. Verification

**Vitest.** Chosen over `node:test` because it resolves the `@/` alias from
`tsconfig.json` and runs TypeScript directly, both of which `node:test` needs
configuration to do. The twelve Python test files port, with these first:

- `test_ledger_invariants` and `test_views` — the money rules and the
  derivation views. These port before any handler is written, so a porting
  error fails a test rather than a balance.
- `test_permissions` — the permission matrix, row by row.
- `test_auth_service` — refresh rotation, including a reused token revoking its
  whole chain.
- `test_security` — hashing and token round trips.
- Tenancy: a repository built for workspace A cannot read, update or delete a
  row in workspace B.

**Build gates.** `npm run build`, `tsc --noEmit`, and the existing `@/lib/demo`
grep gate.

**CI.** One GitHub Actions workflow on push: `vitest run`, `npm run build`,
`tsc --noEmit`, grep gate. The Python job is removed.

**Manual.** After `drizzle-kit migrate` against a scratch Neon branch and a
seed, log in as the demo user and load the dashboard in a browser.

---

## 12. Risks and known constraints

- **The API becomes publicly routable.** The free-tier spec deliberately gave
  the backend no rewrite, so FastAPI could not be reached from the internet.
  A Route Handler is a public URL on the application's own domain. The
  remaining defences are the ones that were always doing the real work —
  bearer authentication on every request, RBAC per route, workspace scoping in
  the repository — but defence in depth is genuinely reduced, and that is the
  price of one deployment. Decision 6 in §2 exists to keep the cross-site
  property that the private service was also providing.
- **Auth is the only tested thing in the repository, and this rewrites it.**
  Mitigated by porting `test_auth_service` and `test_security` before the
  implementation, not after.
- **`node_modules/` is not installed at the repository root.** The Next 16
  guides under `node_modules/next/dist/docs/` cannot be read until `npm
  install` runs, and they must be read before `proxy.ts` or any Route Handler
  is written. This is the same constraint the free-tier spec records in its
  §11, and it is the reason `AGENTS.md` asks for those guides.
- **Argon2id is a native module.** `@node-rs/argon2` ships prebuilt binaries
  and runs on Vercel's Node runtime, but not on the Edge runtime. Any handler
  that hashes or verifies a password must declare the Node runtime.
- **Neon's free plan suspends after five minutes idle.** Unchanged by this
  port; the first request after a quiet period pays a wake-up on top of a cold
  start.
- **Hobby crons fire at most once a day**, in UTC, guaranteed only within the
  hour. Collapsing to a single service does remove the open question the
  free-tier spec flagged about `crons` placement in services mode.

---

## 13. Build order

| Phase | Work | Done when |
|---|---|---|
| P1 | Drizzle schema, three SQL migrations, `db.ts`; `test_views` and `test_ledger_invariants` ported | `drizzle-kit migrate` builds the schema on a scratch Neon branch and both suites pass |
| P2 | `security.ts`, `errors.ts`, auth service, five auth Route Handlers; `test_security`, `test_auth_service`, `test_permissions`, tenancy ported | Login, refresh, logout and workspace switch work against Postgres, all suites green |
| P3 | Seeder merged into `seed.ts`; reseed endpoint; `client.ts` and `proxy.ts` pointed same-origin; `backend/` deleted; `vercel.json` reduced; CI switched | The deployed URL logs in as demo and renders a real dashboard |

Phases 3 through 6 of the free-tier spec then proceed as written, in
TypeScript. Each phase gets its own plan document under
`docs/superpowers/plans/`.

`backend/` is deleted in P3, not P1. Until the ported auth passes its tests
against a real database, the Python service stays in the tree as a reference
that can be run and compared.

---

## 14. Out of scope

Unchanged: the automations engine, third-party integrations, model-backed AI,
billing, API keys, webhooks, rate limiting, and the notification centre. Those
screens keep the preview banner until their sub-projects land.

Also out of scope: any change to the schema, the permission model, the session
design, or the product surface. This port is a change of host and language.
Anything else it appears to change is a defect.
