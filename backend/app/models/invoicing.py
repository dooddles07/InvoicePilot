from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Computed,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, WorkspaceScoped


class InvoiceStatus(str, enum.Enum):
    """Lifecycle only.

    ``overdue`` is deliberately absent: it is a function of ``due_date`` and
    ``balance_cents`` against today, so storing it would mean a row silently
    becoming wrong at midnight.
    """

    draft = "draft"
    sent = "sent"
    viewed = "viewed"
    partially_paid = "partially_paid"
    paid = "paid"
    disputed = "disputed"


class RiskLevel(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Workspace(Base, TimestampMixin):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    plan: Mapped[str] = mapped_column(String(40), nullable=False, default="starter")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")


class Customer(WorkspaceScoped):
    __tablename__ = "customers"
    __table_args__ = (
        Index("ix_customers_workspace_name", "workspace_id", "name"),
        UniqueConstraint("workspace_id", "email", name="uq_customers_workspace_email"),
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(40))
    industry: Mapped[str | None] = mapped_column(String(120))
    payment_terms_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    customer_since: Mapped[date | None] = mapped_column(Date)

    invoices: Mapped[list["Invoice"]] = relationship(back_populates="customer")


class Invoice(WorkspaceScoped):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("workspace_id", "number", name="uq_invoices_workspace_number"),
        # The collections queue reads "open invoices for this workspace, oldest
        # due date first" on every dashboard load. This is that query.
        Index("ix_invoices_workspace_status_due", "workspace_id", "status", "due_date"),
        Index("ix_invoices_workspace_customer", "workspace_id", "customer_id"),
    )

    number: Mapped[str] = mapped_column(String(60), nullable=False)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus, name="invoice_status"), nullable=False, default=InvoiceStatus.draft
    )

    # Money is integer minor units. Float dollars do not survive arithmetic, and
    # a rounding error in an accounts receivable ledger is a support ticket that
    # ends in a spreadsheet reconciliation.
    amount_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)
    paid_cents: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    paid_date: Mapped[date | None] = mapped_column(Date)

    po_number: Mapped[str | None] = mapped_column(String(80))
    notes: Mapped[str | None] = mapped_column(Text)
    last_contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Generated rather than computed in Python: the collections queue orders by
    # expected recovery, which multiplies this value inside SQL. A property
    # cannot be selected, sorted or indexed.
    balance_cents: Mapped[int] = mapped_column(
        BigInteger,
        Computed("GREATEST(amount_cents - paid_cents, 0)", persisted=True),
        nullable=False,
    )

    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    customer: Mapped[Customer] = relationship(back_populates="invoices")
    items: Mapped[list["InvoiceItem"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )


class InvoiceItem(WorkspaceScoped):
    __tablename__ = "invoice_items"

    invoice_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_price_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)
    amount_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)

    invoice: Mapped[Invoice] = relationship(back_populates="items")


class Payment(WorkspaceScoped):
    __tablename__ = "payments"
    __table_args__ = (
        Index("ix_payments_workspace_received", "workspace_id", "received_at"),
    )

    invoice_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=False
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False
    )
    amount_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)
    method: Mapped[str] = mapped_column(String(40), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(120))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
