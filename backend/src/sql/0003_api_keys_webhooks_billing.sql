-- API keys, webhooks, automations, and the Stripe link on workspaces.
--
-- Phase 8: the three screens that need no third party to be real (API keys,
-- webhooks, automations), plus the two columns billing needs once Stripe
-- test-mode credentials land.

CREATE TABLE api_keys (
    id            uuid           PRIMARY KEY,
    workspace_id  uuid           NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    name          varchar(200)   NOT NULL,
    -- Only the hash. The full key is shown once, at creation, and never
    -- stored anywhere it could be read back -- the same reasoning as
    -- refresh_tokens.token_hash.
    key_hash      varchar(64)    NOT NULL,
    last_four     varchar(4)     NOT NULL,
    scopes        text[]         NOT NULL,
    created_at    timestamptz    NOT NULL DEFAULT now(),
    last_used_at  timestamptz,
    -- Soft delete: a revoked key stops authenticating (the middleware checks
    -- this) but the row stays for the audit trail of what a key could once do.
    revoked_at    timestamptz,
    CONSTRAINT uq_api_keys_hash UNIQUE (key_hash),
    CONSTRAINT ck_api_keys_scopes CHECK (scopes <@ ARRAY['read', 'write']::text[])
);

CREATE INDEX ix_api_keys_workspace_id ON api_keys (workspace_id);


CREATE TABLE webhook_endpoints (
    id                uuid          PRIMARY KEY,
    workspace_id      uuid          NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    url               varchar(500)  NOT NULL,
    -- The HMAC signing key. Generated at creation, shown once, same as an
    -- api_keys row -- but kept in the clear here (not hashed), because the
    -- delivery worker must read it back to sign every request.
    secret            varchar(64)   NOT NULL,
    events            text[]        NOT NULL,
    status            varchar(20)   NOT NULL DEFAULT 'active',
    failure_count     integer       NOT NULL DEFAULT 0,
    last_delivery_at  timestamptz,
    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT ck_webhook_endpoints_status CHECK (status IN ('active', 'failing', 'paused'))
);

CREATE INDEX ix_webhook_endpoints_workspace_id ON webhook_endpoints (workspace_id);


CREATE TABLE webhook_deliveries (
    id                   uuid          PRIMARY KEY,
    workspace_id         uuid          NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    webhook_endpoint_id  uuid          NOT NULL REFERENCES webhook_endpoints (id) ON DELETE CASCADE,
    event_type           varchar(60)   NOT NULL,
    payload              jsonb         NOT NULL,
    status               varchar(20)   NOT NULL DEFAULT 'pending',
    response_status      integer,
    attempt              integer       NOT NULL DEFAULT 1,
    delivered_at         timestamptz,
    created_at           timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT ck_webhook_deliveries_status CHECK (status IN ('pending', 'delivered', 'failed'))
);

CREATE INDEX ix_webhook_deliveries_workspace_id ON webhook_deliveries (workspace_id);
-- The endpoint's own delivery log, newest first -- what the webhooks screen
-- and the retry worker both read.
CREATE INDEX ix_webhook_deliveries_endpoint
    ON webhook_deliveries (webhook_endpoint_id, created_at DESC);


CREATE TABLE automations (
    id             uuid          PRIMARY KEY,
    workspace_id   uuid          NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    name           varchar(200)  NOT NULL,
    description    text          NOT NULL DEFAULT '',
    enabled        boolean       NOT NULL DEFAULT true,
    trigger_label  varchar(200)  NOT NULL,
    -- What actually drives the daily evaluator: every automation is "an
    -- invoice crosses this many days overdue", sent at this tone. The
    -- builder's node graph (below) is edited freely and saved faithfully,
    -- but does not change these two -- see services/automations.js.
    trigger_days   integer       NOT NULL,
    tone           varchar(20)   NOT NULL DEFAULT 'friendly',
    -- The visual builder's own state: free-form, opaque to the evaluator.
    -- What a person sees is exactly what was saved, which is the whole of
    -- what this column promises.
    nodes          jsonb         NOT NULL DEFAULT '[]',
    created_at     timestamptz   NOT NULL DEFAULT now(),
    updated_at     timestamptz   NOT NULL DEFAULT now(),
    last_run_at    timestamptz,
    CONSTRAINT ck_automations_tone CHECK (tone IN ('friendly', 'firm', 'final'))
);

CREATE INDEX ix_automations_workspace_id ON automations (workspace_id);
-- The daily evaluator's own query: every enabled automation, once a day.
CREATE INDEX ix_automations_enabled ON automations (workspace_id) WHERE enabled;


CREATE TABLE automation_runs (
    id             uuid         PRIMARY KEY,
    workspace_id   uuid         NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    automation_id  uuid         NOT NULL REFERENCES automations (id) ON DELETE CASCADE,
    matched_count  integer      NOT NULL DEFAULT 0,
    sent_count     integer      NOT NULL DEFAULT 0,
    started_at     timestamptz  NOT NULL,
    finished_at    timestamptz,
    CONSTRAINT ck_automation_runs_counts CHECK (sent_count <= matched_count)
);

CREATE INDEX ix_automation_runs_workspace_id ON automation_runs (workspace_id);
CREATE INDEX ix_automation_runs_automation
    ON automation_runs (automation_id, started_at DESC);


-- Billing: the link to Stripe. Both null until a workspace actually
-- checks out -- a fresh workspace has neither, and reads that as "starter,
-- no payment method" rather than erroring.
ALTER TABLE workspaces ADD COLUMN stripe_customer_id varchar(255);
ALTER TABLE workspaces ADD COLUMN stripe_subscription_id varchar(255);
