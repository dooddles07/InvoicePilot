-- InvoicePilot schema.
--
-- Translated once from Alembic revisions 0001 and 0002 and then frozen. Hand
-- written rather than generated so the tenancy constraints are explicit and
-- reviewable: every tenant table carries workspace_id with an index that leads
-- on it, because every query in the application filters on it first.
--
-- Money is integer minor units throughout. Float dollars do not survive
-- arithmetic, and a rounding error in a receivables ledger ends in a manual
-- reconciliation.

CREATE TYPE invoice_status AS ENUM (
    'draft', 'sent', 'viewed', 'partially_paid', 'paid', 'disputed'
);

-- No column uses this type. The customer_stats view (0001_derivation_views)
-- casts to it, so that a risk grade coming out of SQL is the same type the
-- application would have stored had risk remained a column.
CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high');


CREATE TABLE workspaces (
    id          uuid          PRIMARY KEY,
    name        varchar(200)  NOT NULL,
    slug        varchar(120)  NOT NULL UNIQUE,
    plan        varchar(40)   NOT NULL DEFAULT 'starter',
    currency    varchar(3)    NOT NULL DEFAULT 'USD',
    created_at  timestamptz   NOT NULL DEFAULT now(),
    updated_at  timestamptz   NOT NULL DEFAULT now()
);


CREATE TABLE users (
    id             uuid          PRIMARY KEY,
    email          varchar(320)  NOT NULL,
    full_name      varchar(200)  NOT NULL,
    avatar_url     varchar(500),
    password_hash  varchar(255)  NOT NULL,
    created_at     timestamptz   NOT NULL DEFAULT now(),
    updated_at     timestamptz   NOT NULL DEFAULT now()
);

-- A functional index rather than a citext column, so the schema needs no
-- extension. Sam@example.com and sam@example.com are one account.
CREATE UNIQUE INDEX uq_users_email_lower ON users (LOWER(email));


CREATE TABLE refresh_tokens (
    id              uuid         PRIMARY KEY,
    user_id         uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- Only the hash. A leaked database must not yield usable sessions.
    token_hash      varchar(64)  NOT NULL,
    expires_at      timestamptz  NOT NULL,
    revoked_at      timestamptz,
    replaced_by_id  uuid         REFERENCES refresh_tokens (id) ON DELETE SET NULL,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash)
);

CREATE INDEX ix_refresh_tokens_user ON refresh_tokens (user_id);


CREATE TABLE workspace_members (
    id              uuid         PRIMARY KEY,
    workspace_id    uuid         NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    user_id         uuid         REFERENCES users (id) ON DELETE CASCADE,
    -- Held on the invitation until the person accepts and a user row exists.
    invited_email   varchar(320),
    role            varchar(20)  NOT NULL DEFAULT 'member',
    status          varchar(20)  NOT NULL DEFAULT 'active',
    last_active_at  timestamptz,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uq_workspace_members_workspace_user UNIQUE (workspace_id, user_id),
    CONSTRAINT ck_workspace_members_role
        CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    CONSTRAINT ck_workspace_members_status
        CHECK (status IN ('active', 'invited')),
    -- Either a real user or a pending invitation, never neither.
    CONSTRAINT ck_workspace_members_identified
        CHECK (user_id IS NOT NULL OR invited_email IS NOT NULL)
);

CREATE INDEX ix_workspace_members_workspace_id ON workspace_members (workspace_id);
CREATE INDEX ix_workspace_members_user ON workspace_members (user_id);


CREATE TABLE customers (
    id                  uuid          PRIMARY KEY,
    workspace_id        uuid          NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    name                varchar(200)  NOT NULL,
    contact_name        varchar(200)  NOT NULL,
    email               varchar(320)  NOT NULL,
    phone               varchar(40),
    industry            varchar(120),
    payment_terms_days  integer       NOT NULL DEFAULT 30,
    customer_since      date,
    created_at          timestamptz   NOT NULL DEFAULT now(),
    updated_at          timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT uq_customers_workspace_email UNIQUE (workspace_id, email)
);

CREATE INDEX ix_customers_workspace_id ON customers (workspace_id);
CREATE INDEX ix_customers_workspace_name ON customers (workspace_id, name);


CREATE TABLE invoices (
    id                 uuid            PRIMARY KEY,
    workspace_id       uuid            NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    number             varchar(60)     NOT NULL,
    customer_id        uuid            NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
    status             invoice_status  NOT NULL DEFAULT 'draft',
    amount_cents       bigint          NOT NULL,
    paid_cents         bigint          NOT NULL DEFAULT 0,
    -- Stored rather than computed in the application, so the collections
    -- ranking can sort and index on it.
    balance_cents      bigint          NOT NULL
                       GENERATED ALWAYS AS (GREATEST(amount_cents - paid_cents, 0)) STORED,
    issue_date         date            NOT NULL,
    due_date           date            NOT NULL,
    paid_date          date,
    po_number          varchar(80),
    notes              text,
    last_contacted_at  timestamptz,
    sent_at            timestamptz,
    viewed_at          timestamptz,
    created_at         timestamptz     NOT NULL DEFAULT now(),
    updated_at         timestamptz     NOT NULL DEFAULT now(),
    CONSTRAINT uq_invoices_workspace_number UNIQUE (workspace_id, number),
    -- Money cannot go backwards, and you cannot receive more than you billed.
    -- Enforced in the database because the application is not the only thing
    -- that will ever write to this table.
    CONSTRAINT ck_invoices_amount_positive CHECK (amount_cents > 0),
    CONSTRAINT ck_invoices_paid_within_amount
        CHECK (paid_cents >= 0 AND paid_cents <= amount_cents),
    CONSTRAINT ck_invoices_due_after_issue CHECK (due_date >= issue_date)
);

CREATE INDEX ix_invoices_workspace_id ON invoices (workspace_id);
-- The dashboard query: open invoices for this workspace, oldest due first.
CREATE INDEX ix_invoices_workspace_status_due
    ON invoices (workspace_id, status, due_date);
CREATE INDEX ix_invoices_workspace_customer
    ON invoices (workspace_id, customer_id);
-- The collections queue reads open balances for one workspace, largest first.
-- A partial index keeps paid invoices -- most of the table over time -- out of
-- it entirely.
CREATE INDEX ix_invoices_workspace_balance
    ON invoices (workspace_id, balance_cents)
    WHERE balance_cents > 0;


CREATE TABLE invoice_items (
    id                uuid          PRIMARY KEY,
    workspace_id      uuid          NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    invoice_id        uuid          NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
    description       varchar(300)  NOT NULL,
    quantity          integer       NOT NULL DEFAULT 1,
    unit_price_cents  bigint        NOT NULL,
    amount_cents      bigint        NOT NULL,
    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT ck_invoice_items_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX ix_invoice_items_workspace_id ON invoice_items (workspace_id);
CREATE INDEX ix_invoice_items_invoice_id ON invoice_items (invoice_id);


CREATE TABLE payments (
    id            uuid         PRIMARY KEY,
    workspace_id  uuid         NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    invoice_id    uuid         NOT NULL REFERENCES invoices (id) ON DELETE RESTRICT,
    customer_id   uuid         NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
    amount_cents  bigint       NOT NULL,
    method        varchar(40)  NOT NULL,
    reference     varchar(120),
    received_at   timestamptz  NOT NULL,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT ck_payments_amount_positive CHECK (amount_cents > 0)
);

CREATE INDEX ix_payments_workspace_id ON payments (workspace_id);
CREATE INDEX ix_payments_workspace_received ON payments (workspace_id, received_at);


CREATE TABLE collection_events (
    id            uuid          PRIMARY KEY,
    workspace_id  uuid          NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    invoice_id    uuid          REFERENCES invoices (id) ON DELETE CASCADE,
    customer_id   uuid          NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
    type          varchar(40)   NOT NULL,
    channel       varchar(20),
    summary       varchar(300)  NOT NULL,
    detail        text,
    actor         varchar(200)  NOT NULL,
    occurred_at   timestamptz   NOT NULL,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX ix_collection_events_workspace_id ON collection_events (workspace_id);
CREATE INDEX ix_collection_events_workspace_invoice
    ON collection_events (workspace_id, invoice_id, occurred_at);
CREATE INDEX ix_collection_events_workspace_customer
    ON collection_events (workspace_id, customer_id);


CREATE TABLE communication_logs (
    id                   uuid          PRIMARY KEY,
    workspace_id         uuid          NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    invoice_id           uuid          REFERENCES invoices (id) ON DELETE SET NULL,
    customer_id          uuid          NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
    channel              varchar(20)   NOT NULL DEFAULT 'email',
    to_address           varchar(320)  NOT NULL,
    subject              varchar(300)  NOT NULL,
    body                 text          NOT NULL,
    status               varchar(20)   NOT NULL DEFAULT 'queued',
    provider_message_id  varchar(200),
    idempotency_key      varchar(64)   NOT NULL,
    error                text,
    queued_at            timestamptz   NOT NULL,
    sent_at              timestamptz,
    created_at           timestamptz   NOT NULL DEFAULT now(),
    updated_at           timestamptz   NOT NULL DEFAULT now(),
    -- The whole idempotency mechanism. A double-clicked send collides here
    -- instead of emailing the customer twice.
    CONSTRAINT uq_communication_logs_workspace_key
        UNIQUE (workspace_id, idempotency_key),
    CONSTRAINT ck_communication_logs_status
        CHECK (status IN ('queued', 'sent', 'failed'))
);

CREATE INDEX ix_communication_logs_workspace_id ON communication_logs (workspace_id);
CREATE INDEX ix_communication_logs_workspace_status
    ON communication_logs (workspace_id, status);


CREATE TABLE audit_logs (
    id             uuid          PRIMARY KEY,
    workspace_id   uuid          NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    actor_user_id  uuid          REFERENCES users (id) ON DELETE SET NULL,
    -- Denormalised: the log must still read correctly once the user is gone.
    actor_label    varchar(200)  NOT NULL,
    action         varchar(80)   NOT NULL,
    target_type    varchar(40)   NOT NULL,
    target_id      varchar(80)   NOT NULL,
    ip             varchar(45),
    occurred_at    timestamptz   NOT NULL,
    created_at     timestamptz   NOT NULL DEFAULT now(),
    updated_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX ix_audit_logs_workspace_id ON audit_logs (workspace_id);
CREATE INDEX ix_audit_logs_workspace_occurred
    ON audit_logs (workspace_id, occurred_at DESC);


CREATE TABLE email_templates (
    id            uuid          PRIMARY KEY,
    workspace_id  uuid          NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    name          varchar(120)  NOT NULL,
    tone          varchar(20)   NOT NULL,
    subject       varchar(300)  NOT NULL,
    body          text          NOT NULL,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_at    timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT uq_email_templates_workspace_tone UNIQUE (workspace_id, tone)
);

CREATE INDEX ix_email_templates_workspace_id ON email_templates (workspace_id);


CREATE TABLE import_batches (
    id              uuid          PRIMARY KEY,
    workspace_id    uuid          NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    created_by      uuid          REFERENCES users (id) ON DELETE SET NULL,
    filename        varchar(300)  NOT NULL,
    row_count       integer       NOT NULL DEFAULT 0,
    accepted_count  integer       NOT NULL DEFAULT 0,
    rejected_count  integer       NOT NULL DEFAULT 0,
    imported_cents  bigint        NOT NULL DEFAULT 0,
    status          varchar(20)   NOT NULL DEFAULT 'pending',
    rejections      jsonb,
    created_at      timestamptz   NOT NULL DEFAULT now(),
    updated_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX ix_import_batches_workspace_id ON import_batches (workspace_id);
