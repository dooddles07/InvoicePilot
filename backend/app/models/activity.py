from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import WorkspaceScoped


class CollectionEvent(WorkspaceScoped):
    """The invoice timeline. One row per thing that happened."""

    __tablename__ = "collection_events"
    __table_args__ = (
        Index(
            "ix_collection_events_workspace_invoice",
            "workspace_id",
            "invoice_id",
            "occurred_at",
        ),
        Index(
            "ix_collection_events_workspace_customer", "workspace_id", "customer_id"
        ),
    )

    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE")
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    channel: Mapped[str | None] = mapped_column(String(20))
    summary: Mapped[str] = mapped_column(String(300), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text)
    actor: Mapped[str] = mapped_column(String(200), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class CommunicationLog(WorkspaceScoped):
    """The outbox.

    A row is written and committed *before* the provider is called, so a crash
    mid-send leaves a row visibly stuck at ``queued`` rather than an audit
    entry claiming a customer was contacted when they were not.
    """

    __tablename__ = "communication_logs"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "idempotency_key",
            name="uq_communication_logs_workspace_key",
        ),
        Index("ix_communication_logs_workspace_status", "workspace_id", "status"),
    )

    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL")
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
    )
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="email")
    to_address: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued")
    provider_message_id: Mapped[str | None] = mapped_column(String(200))
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)
    error: Mapped[str | None] = mapped_column(Text)
    queued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(WorkspaceScoped):
    """Every action that changes a record or contacts a customer."""

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_workspace_occurred", "workspace_id", "occurred_at"),
    )

    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    # Denormalised so the log still reads correctly after the user is deleted.
    actor_label: Mapped[str] = mapped_column(String(200), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    target_type: Mapped[str] = mapped_column(String(40), nullable=False)
    target_id: Mapped[str] = mapped_column(String(80), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(45))
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class EmailTemplate(WorkspaceScoped):
    """Reminder copy, one per tone. Seeded when a workspace is created."""

    __tablename__ = "email_templates"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "tone", name="uq_email_templates_workspace_tone"
        ),
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    tone: Mapped[str] = mapped_column(String(20), nullable=False)
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)


class ImportBatch(WorkspaceScoped):
    """The outcome of one CSV import, including what was rejected and why."""

    __tablename__ = "import_batches"

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    accepted_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rejected_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    imported_cents: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    rejections: Mapped[list | None] = mapped_column(JSONB)
