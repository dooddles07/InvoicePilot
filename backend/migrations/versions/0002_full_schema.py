"""Full schema: auth, tenancy, activity, outbox, and the invoice changes.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-08

Written by hand, like 0001. Two things here are worth reading before editing:

* Postgres cannot remove a value from an enum type, so ``invoice_status`` is
  rebuilt and the column re-cast. Any row sitting at ``overdue`` is moved to
  ``sent`` first, because overdue is now derived from the due date rather
  than stored.
* ``balance_cents`` becomes a stored generated column. It replaces a Python
  property so the collections ranking can sort and index on it.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels = None
depends_on = None

OLD_STATUSES = (
    "draft",
    "sent",
    "viewed",
    "partially_paid",
    "paid",
    "overdue",
    "disputed",
)
NEW_STATUSES = ("draft", "sent", "viewed", "partially_paid", "paid", "disputed")


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    ]


def _swap_status_enum(
    values: tuple[str, ...], *, retired_value: str | None, fallback: str
) -> None:
    """Rebuild ``invoice_status`` so it holds exactly ``values``.

    Postgres has no DROP VALUE, so the type is recreated and the column is
    re-cast through text. Rows holding the value being removed must be moved
    to ``fallback`` first or the cast fails.
    """

    if retired_value is not None:
        op.execute(
            f"UPDATE invoices SET status = '{fallback}' "
            f"WHERE status::text = '{retired_value}'"
        )
    literals = ", ".join(f"'{value}'" for value in values)
    op.execute(f"CREATE TYPE invoice_status_new AS ENUM ({literals})")
    # The default is dropped and restored around the cast: Postgres will not
    # re-cast a column whose default still refers to the old type.
    op.execute("ALTER TABLE invoices ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE invoices ALTER COLUMN status "
        "TYPE invoice_status_new USING status::text::invoice_status_new"
    )
    op.execute("DROP TYPE invoice_status")
    op.execute("ALTER TYPE invoice_status_new RENAME TO invoice_status")
    op.execute(
        "ALTER TABLE invoices ALTER COLUMN status SET DEFAULT 'draft'::invoice_status"
    )


def upgrade() -> None:
    # --- invoices -----------------------------------------------------------
    _swap_status_enum(NEW_STATUSES, retired_value="overdue", fallback="sent")

    # Invoice risk was always the customer's risk wearing a disguise. It now
    # lives in the customer_stats view (migration 0003).
    op.drop_column("invoices", "risk")

    op.add_column(
        "invoices",
        sa.Column(
            "balance_cents",
            sa.BigInteger,
            sa.Computed("GREATEST(amount_cents - paid_cents, 0)", persisted=True),
            nullable=False,
        ),
    )
    op.add_column("invoices", sa.Column("sent_at", sa.DateTime(timezone=True)))
    op.add_column("invoices", sa.Column("viewed_at", sa.DateTime(timezone=True)))
    # The collections queue reads open balances for one workspace, largest
    # first. A partial index keeps paid invoices -- most of the table over
    # time -- out of it entirely.
    op.create_index(
        "ix_invoices_workspace_balance",
        "invoices",
        ["workspace_id", "balance_cents"],
        postgresql_where=sa.text("balance_cents > 0"),
    )

    # --- auth ---------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("avatar_url", sa.String(500)),
        sa.Column("password_hash", sa.String(255), nullable=False),
        *_timestamps(),
    )
    # A functional index rather than a citext column, so the schema needs no
    # extension. Sam@example.com and sam@example.com are one account.
    op.create_index(
        "uq_users_email_lower", "users", [sa.text("LOWER(email)")], unique=True
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Only the hash. A leaked database must not yield usable sessions.
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column(
            "replaced_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("refresh_tokens.id", ondelete="SET NULL"),
        ),
        *_timestamps(),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_hash"),
    )
    op.create_index("ix_refresh_tokens_user", "refresh_tokens", ["user_id"])

    op.create_table(
        "workspace_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
        ),
        sa.Column("invited_email", sa.String(320)),
        sa.Column("role", sa.String(20), nullable=False, server_default="member"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("last_active_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.UniqueConstraint(
            "workspace_id", "user_id", name="uq_workspace_members_workspace_user"
        ),
        sa.CheckConstraint(
            "role IN ('owner', 'admin', 'member', 'viewer')",
            name="ck_workspace_members_role",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'invited')", name="ck_workspace_members_status"
        ),
        # Either a real user or a pending invitation, never neither.
        sa.CheckConstraint(
            "user_id IS NOT NULL OR invited_email IS NOT NULL",
            name="ck_workspace_members_identified",
        ),
    )
    op.create_index(
        "ix_workspace_members_workspace_id", "workspace_members", ["workspace_id"]
    )
    op.create_index("ix_workspace_members_user", "workspace_members", ["user_id"])

    # --- activity -----------------------------------------------------------
    op.create_table(
        "collection_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "invoice_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("invoices.id", ondelete="CASCADE"),
        ),
        sa.Column(
            "customer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("customers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("channel", sa.String(20)),
        sa.Column("summary", sa.String(300), nullable=False),
        sa.Column("detail", sa.Text),
        sa.Column("actor", sa.String(200), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        *_timestamps(),
    )
    op.create_index(
        "ix_collection_events_workspace_id", "collection_events", ["workspace_id"]
    )
    op.create_index(
        "ix_collection_events_workspace_invoice",
        "collection_events",
        ["workspace_id", "invoice_id", "occurred_at"],
    )
    op.create_index(
        "ix_collection_events_workspace_customer",
        "collection_events",
        ["workspace_id", "customer_id"],
    )

    op.create_table(
        "communication_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "invoice_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("invoices.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "customer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("customers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("channel", sa.String(20), nullable=False, server_default="email"),
        sa.Column("to_address", sa.String(320), nullable=False),
        sa.Column("subject", sa.String(300), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("provider_message_id", sa.String(200)),
        sa.Column("idempotency_key", sa.String(64), nullable=False),
        sa.Column("error", sa.Text),
        sa.Column("queued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        # The whole idempotency mechanism. A double-clicked send collides here
        # instead of emailing the customer twice.
        sa.UniqueConstraint(
            "workspace_id",
            "idempotency_key",
            name="uq_communication_logs_workspace_key",
        ),
        sa.CheckConstraint(
            "status IN ('queued', 'sent', 'failed')",
            name="ck_communication_logs_status",
        ),
    )
    op.create_index(
        "ix_communication_logs_workspace_id", "communication_logs", ["workspace_id"]
    )
    op.create_index(
        "ix_communication_logs_workspace_status",
        "communication_logs",
        ["workspace_id", "status"],
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "actor_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        # Denormalised: the log must still read correctly once the user is gone.
        sa.Column("actor_label", sa.String(200), nullable=False),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("target_type", sa.String(40), nullable=False),
        sa.Column("target_id", sa.String(80), nullable=False),
        sa.Column("ip", sa.String(45)),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        *_timestamps(),
    )
    op.create_index("ix_audit_logs_workspace_id", "audit_logs", ["workspace_id"])
    op.create_index(
        "ix_audit_logs_workspace_occurred",
        "audit_logs",
        ["workspace_id", sa.text("occurred_at DESC")],
    )

    op.create_table(
        "email_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("tone", sa.String(20), nullable=False),
        sa.Column("subject", sa.String(300), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        *_timestamps(),
        sa.UniqueConstraint(
            "workspace_id", "tone", name="uq_email_templates_workspace_tone"
        ),
    )
    op.create_index(
        "ix_email_templates_workspace_id", "email_templates", ["workspace_id"]
    )

    op.create_table(
        "import_batches",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("filename", sa.String(300), nullable=False),
        sa.Column("row_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("accepted_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("rejected_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("imported_cents", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("rejections", postgresql.JSONB),
        *_timestamps(),
    )
    op.create_index(
        "ix_import_batches_workspace_id", "import_batches", ["workspace_id"]
    )


def downgrade() -> None:
    op.drop_table("import_batches")
    op.drop_table("email_templates")
    op.drop_table("audit_logs")
    op.drop_table("communication_logs")
    op.drop_table("collection_events")
    op.drop_table("workspace_members")
    op.drop_table("refresh_tokens")
    op.drop_table("users")

    op.drop_index("ix_invoices_workspace_balance", table_name="invoices")
    op.drop_column("invoices", "viewed_at")
    op.drop_column("invoices", "sent_at")
    op.drop_column("invoices", "balance_cents")
    op.add_column(
        "invoices",
        sa.Column(
            "risk",
            postgresql.ENUM(name="risk_level", create_type=False),
            nullable=False,
            server_default="low",
        ),
    )
    # Nothing is moved back to 'overdue': that information no longer exists as
    # a status, and re-deriving it here would be a guess.
    _swap_status_enum(OLD_STATUSES, retired_value=None, fallback="sent")
