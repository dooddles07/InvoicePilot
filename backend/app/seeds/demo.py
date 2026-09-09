"""The demo ledger, ported from src/lib/data/seed.ts.

Deterministic: the same seed produces the same 460 invoices every run, so a
screenshot taken today matches one taken next month and a failing invariant
test points at a real regression rather than at fresh randomness.

Porting notes (see the implementation plan for the full rationale):
* seed.ts writes status "overdue" for a stale open invoice. That status no
  longer exists in the schema -- emitted as "sent" instead, since
  invoice_state derives overdue-ness from the due date.
* seed.ts writes a per-invoice "risk" field. Dropped -- risk now comes from
  the customer_stats view.
* Line items split the invoice total evenly (split_into_items) rather than
  by a random per-item share as seed.ts does. Both guarantee the items sum
  to the invoice total; the even split removes a source of drift for no
  behavioural loss, since nothing downstream reads individual item amounts.
"""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.activity import CollectionEvent, EmailTemplate
from app.models.auth import User, WorkspaceMember
from app.models.invoicing import (
    Customer,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    Payment,
    Workspace,
)
from app.seeds.rng import Rng, js_round

NOW = datetime(2026, 9, 8, 9, 12, tzinfo=timezone.utc)

INVOICE_COUNT = 460
LEDGER_START_DAYS = 430
SIZE_SCALE = 0.12
DELINQUENCY_HORIZON_DAYS = 210

SEED = 0x0001_9F0C


@dataclass(frozen=True, slots=True)
class CustomerSeed:
    name: str
    industry: str
    contact: str
    domain: str
    reliability: float  # 0 = chronically late, 1 = always early
    size: int  # typical invoice size in dollars
    terms: int
    trend: float  # negative means behaviour has worsened


# Copied verbatim from src/lib/data/seed.ts:167-206. Data, not logic.
CUSTOMER_SEEDS: list[CustomerSeed] = [
    CustomerSeed("Acme Corporation", "Manufacturing", "Dana Whitfield", "acmecorp.com", 0.34, 9200, 30, -0.28),
    CustomerSeed("Northstar Consulting", "Professional Services", "Miles Rutherford", "northstar-consulting.com", 0.41, 6400, 30, -0.19),
    CustomerSeed("Brightline Studio", "Creative Agency", "Yuki Tanaka", "brightlinestudio.com", 0.62, 4800, 14, -0.06),
    CustomerSeed("Vertex Logistics", "Logistics", "Carla Mendes", "vertexlogistics.com", 0.78, 15400, 45, 0.04),
    CustomerSeed("Summit Construction", "Construction", "Raymond Ellis", "summitconstruction.com", 0.52, 22800, 45, -0.11),
    CustomerSeed("Nova Digital", "Software", "Ingrid Solberg", "novadigital.io", 0.88, 5200, 14, 0.07),
    CustomerSeed("Halden & Reeve", "Legal", "Beatrice Halden", "haldenreeve.com", 0.91, 11200, 30, 0.02),
    CustomerSeed("Portside Freight", "Logistics", "Omar Haddad", "portsidefreight.com", 0.47, 18600, 60, -0.14),
    CustomerSeed("Cedarwood Interiors", "Design & Build", "Marta Kovac", "cedarwoodinteriors.com", 0.71, 7400, 30, 0.01),
    CustomerSeed("Ironvale Engineering", "Engineering", "Douglas Pryce", "ironvale-eng.com", 0.66, 26400, 45, -0.03),
    CustomerSeed("Willowbrook Health", "Healthcare", "Adaeze Nwosu", "willowbrookhealth.org", 0.83, 13800, 30, 0.05),
    CustomerSeed("Peregrine Analytics", "Data & Analytics", "Sven Lindqvist", "peregrineanalytics.com", 0.86, 8900, 14, 0.03),
    CustomerSeed("Kestrel Media Group", "Media", "Rosalind Achebe", "kestrelmedia.com", 0.58, 6100, 30, -0.09),
    CustomerSeed("Bluepeak Ventures", "Finance", "Julian Voss", "bluepeakventures.com", 0.94, 19200, 14, 0.06),
    CustomerSeed("Thornbury Retail", "Retail", "Fiona Marsh", "thornburyretail.com", 0.55, 4200, 30, -0.16),
    CustomerSeed("Granite Peak Supply", "Wholesale", "Hector Alvarez", "granitepeaksupply.com", 0.69, 16800, 45, -0.02),
    CustomerSeed("Lumen Architects", "Architecture", "Nadia Farouk", "lumenarchitects.com", 0.74, 12400, 30, 0.0),
    CustomerSeed("Redwood Provisions", "Food & Beverage", "Callum Doyle", "redwoodprovisions.com", 0.63, 3600, 14, -0.05),
    CustomerSeed("Atlas Fabrication", "Manufacturing", "Greta Lindholm", "atlasfab.com", 0.49, 20400, 60, -0.21),
    CustomerSeed("Silverline Insurance", "Insurance", "Patrick Nolan", "silverlineins.com", 0.9, 14600, 30, 0.04),
    CustomerSeed("Copperfield Labs", "Biotech", "Ana Beltran", "copperfieldlabs.com", 0.81, 24800, 45, 0.02),
    CustomerSeed("Marlowe Publishing", "Publishing", "Edith Cranfield", "marlowepublishing.com", 0.72, 5600, 30, -0.01),
    CustomerSeed("Fenwick Property Group", "Real Estate", "Samuel Okonjo", "fenwickproperty.com", 0.57, 28600, 60, -0.12),
    CustomerSeed("Harborview Hotels", "Hospitality", "Renata Oliveira", "harborviewhotels.com", 0.64, 17200, 45, -0.07),
    CustomerSeed("Quantum Print Works", "Printing", "Tobias Wren", "quantumprintworks.com", 0.6, 3100, 14, 0.0),
    CustomerSeed("Everline Telecom", "Telecommunications", "Simone Duval", "everlinetelecom.com", 0.85, 21400, 30, 0.03),
    CustomerSeed("Bramble & Hart", "Consulting", "Owen Bramble", "brambleandhart.com", 0.76, 9800, 30, 0.01),
    CustomerSeed("Sable Ridge Energy", "Energy", "Priya Deshmukh", "sableridgeenergy.com", 0.7, 32400, 45, -0.04),
    CustomerSeed("Kingfisher Marine", "Marine Services", "Angus MacLeod", "kingfishermarine.com", 0.53, 11800, 45, -0.15),
    CustomerSeed("Auberon Textiles", "Textiles", "Leila Naderi", "auberontextiles.com", 0.67, 7900, 30, -0.02),
    CustomerSeed("Pinnacle Dental Group", "Healthcare", "Marcus Aleman", "pinnacledental.com", 0.87, 6700, 14, 0.05),
    CustomerSeed("Westgate Security", "Security Services", "Deborah Quinn", "westgatesecurity.com", 0.79, 10400, 30, 0.02),
    CustomerSeed("Orchard Lane Foods", "Food & Beverage", "Tomas Ferreira", "orchardlanefoods.com", 0.61, 8300, 30, -0.08),
    CustomerSeed("Delmar Aviation", "Aviation", "Celine Rousseau", "delmaraviation.com", 0.75, 36800, 60, 0.0),
    CustomerSeed("Ashcroft Financial", "Finance", "Nigel Ashcroft", "ashcroftfinancial.com", 0.92, 15900, 14, 0.04),
    CustomerSeed("Verdant Landscapes", "Landscaping", "Isabel Moreno", "verdantlandscapes.com", 0.56, 5400, 30, -0.1),
    CustomerSeed("Stonebridge Academy", "Education", "Harriet Blythe", "stonebridgeacademy.edu", 0.84, 12900, 45, 0.01),
    CustomerSeed("Tessera Software", "Software", "Rui Nakamura", "tessera.dev", 0.89, 7200, 14, 0.06),
    CustomerSeed("Ravenswood Brewing", "Food & Beverage", "Gabriel Stokes", "ravenswoodbrewing.com", 0.59, 4600, 30, -0.06),
    CustomerSeed("Meridian Freight Lines", "Logistics", "Aisha Bello", "meridianfreightlines.com", 0.68, 19800, 45, -0.03),
]

# Copied verbatim from src/lib/data/seed.ts:209-222.
LINE_ITEMS: dict[str, list[str]] = {
    "default": [
        "Professional services retainer",
        "Project delivery milestone",
        "Consulting hours",
        "Account management",
    ],
    "Manufacturing": ["Tooling and setup", "Production run", "Quality inspection", "Materials handling"],
    "Logistics": ["Freight forwarding", "Warehousing (monthly)", "Last-mile delivery", "Customs brokerage"],
    "Construction": ["Site preparation", "Structural works progress claim", "Fit-out labour", "Materials supply"],
    "Software": ["Platform licence (annual)", "Implementation services", "Priority support tier", "Custom integration"],
    "Healthcare": ["Clinical services", "Equipment servicing", "Compliance audit", "Staff training programme"],
    "Creative Agency": ["Brand identity phase", "Campaign production", "Content retainer", "Motion design"],
}

METHODS = ["bank_transfer", "ach", "card", "stripe", "check", "paypal"]

EVENT_SUMMARY = {
    "invoice_sent": "Invoice sent",
    "invoice_viewed": "Invoice viewed by customer",
    "reminder_sent": "Friendly reminder sent",
    "escalation_sent": "Escalation notice sent",
    "call_logged": "Call logged with accounts payable",
    "payment_received": "Payment received",
    "dispute_raised": "Dispute raised by customer",
    "automation_ran": "Automation ran",
}


def amount_for(seed: CustomerSeed, rng: Rng) -> int:
    """Log-ish spread around the customer's typical size.

    Rounded to a believable invoice figure rather than a random cent value.
    """
    factor = math.exp(rng.between(-0.55, 0.6))
    dollars = seed.size * SIZE_SCALE * factor
    rounded = js_round(dollars / 10) * 10
    return max(48_000, rounded * 100)


def settlement_delay(seed: CustomerSeed, age_days: int, rng: Rng) -> int:
    """Days after the due date this customer actually pays."""
    # Behaviour drifts: `trend` moves recent invoices later or earlier.
    recency = 1 - min(age_days / LEDGER_START_DAYS, 1)
    drift = -seed.trend * 18 * recency
    # Reliable accounts genuinely pay early. That offset is what makes on-time
    # rate a real statistic rather than noise around the due date.
    base = (1 - seed.reliability) * 40 - 14
    return js_round(base + drift + rng.between(-4, 6))


def is_delinquent(seed: CustomerSeed, age_days: int, rng: Rng) -> bool:
    """Some invoices are never settled inside the horizon.

    Without this the ledger self-cleans: every old invoice ends up paid and the
    aging report has nothing past 30 days, which is not what a real collections
    book looks like.
    """
    if age_days > DELINQUENCY_HORIZON_DAYS:
        return False
    return rng.next() < (1 - seed.reliability) * 0.34


@dataclass(slots=True)
class Draft:
    seed: CustomerSeed
    customer_index: int
    issue: datetime
    due: datetime
    paid: datetime | None
    amount_cents: int
    paid_cents: int
    status: str


def build_drafts(rng: Rng) -> list[Draft]:
    drafts: list[Draft] = []
    for _ in range(INVOICE_COUNT):
        # Weighted so a handful of accounts dominate the ledger, as in a real
        # book of business.
        index = math.floor(pow(rng.next(), 1.55) * len(CUSTOMER_SEEDS))
        seed = CUSTOMER_SEEDS[index]

        age_days = js_round(rng.next() * LEDGER_START_DAYS)
        issue = NOW - timedelta(days=age_days)
        due = issue + timedelta(days=seed.terms)
        amount_cents = amount_for(seed, rng)

        delay = settlement_delay(seed, age_days, rng)
        settled = (
            NOW + timedelta(days=3650)
            if is_delinquent(seed, age_days, rng)
            else due + timedelta(days=delay)
        )

        paid: datetime | None = None
        paid_cents = 0

        if settled <= NOW:
            status = "paid"
            paid = settled
            paid_cents = amount_cents
        elif due < NOW:
            roll = rng.next()
            if roll < 0.08:
                status = "disputed"
            elif roll < 0.2:
                status = "partially_paid"
                paid_cents = js_round(amount_cents * rng.between(0.25, 0.6) / 1000) * 1000
            else:
                # seed.ts writes "overdue" here. That status no longer exists;
                # invoice_state derives overdue-ness from the due date.
                status = "sent"
        else:
            roll = rng.next()
            status = "draft" if roll < 0.12 else ("sent" if roll < 0.55 else "viewed")

        drafts.append(
            Draft(seed, index, issue, due, paid, amount_cents, paid_cents, status)
        )

    # Sorted by issue date so invoice numbers run in chronological order.
    drafts.sort(key=lambda d: d.issue)
    return drafts


def split_into_items(amount_cents: int, count: int) -> list[int]:
    """Split a total across line items so they sum to it exactly.

    The remainder goes on the last item. Rounding each item independently
    leaves a few cents unaccounted for, and the line-items invariant fails.
    """
    each = amount_cents // count
    items = [each] * count
    items[-1] = amount_cents - each * (count - 1)
    return items


def _line_pool(industry: str) -> list[str]:
    return LINE_ITEMS.get(industry, LINE_ITEMS["default"])


def seed_demo_workspace(session: Session, *, owner_email: str) -> uuid.UUID:
    """Create a complete demo workspace and return its id.

    Everything is inserted in one session and flushed, not committed -- the
    caller owns the transaction, which is what lets the tests roll it back.
    """
    rng = Rng(SEED)

    workspace_id = uuid.uuid4()
    session.add(
        Workspace(
            id=workspace_id,
            name="Meridian Studio",
            slug=f"meridian-studio-{workspace_id.hex[:8]}",
            plan="professional",
            currency="USD",
        )
    )

    owner_id = uuid.uuid4()
    session.add(
        User(
            id=owner_id,
            email=owner_email,
            full_name="Alex Mercer",
            password_hash="",
        )
    )
    # None of these models declare an ORM relationship() back to Workspace or
    # User -- only a bare foreign-key column -- so the unit of work has no
    # signal to order INSERTs across tables/classes and a later flush can send
    # child rows before the parent. Flushing each parent immediately avoids it.
    session.flush()

    session.add(
        WorkspaceMember(
            id=uuid.uuid4(),
            workspace_id=workspace_id,
            user_id=owner_id,
            role="owner",
            status="active",
        )
    )

    for tone, subject, body in (
        ("friendly", "A friendly nudge about invoice {number}", "Hi there, just a quick reminder that invoice {number} is now due. Let us know if you have any questions."),
        ("firm", "Invoice {number} is now overdue", "Invoice {number} remains unpaid past its due date. Please arrange payment at your earliest convenience."),
        ("final", "Final notice: invoice {number}", "This is a final notice regarding invoice {number}. Please settle this balance immediately to avoid further action."),
    ):
        session.add(
            EmailTemplate(
                id=uuid.uuid4(),
                workspace_id=workspace_id,
                name=f"{tone.capitalize()} reminder",
                tone=tone,
                subject=subject,
                body=body,
            )
        )

    session.flush()

    customer_ids = [uuid.uuid4() for _ in CUSTOMER_SEEDS]
    for seed, customer_id in zip(CUSTOMER_SEEDS, customer_ids, strict=True):
        first_name = seed.contact.split(" ")[0].lower()
        session.add(
            Customer(
                id=customer_id,
                workspace_id=workspace_id,
                name=seed.name,
                contact_name=seed.contact,
                email=f"{first_name}@{seed.domain}",
                phone=f"+1 ({rng.int_between(201, 989)}) {rng.int_between(200, 999)}-{rng.int_between(1000, 9999):04d}",
                industry=seed.industry,
                payment_terms_days=seed.terms,
                customer_since=(
                    NOW - timedelta(days=rng.int_between(LEDGER_START_DAYS, LEDGER_START_DAYS + 900))
                ).date(),
            )
        )

    session.flush()

    drafts = build_drafts(rng)

    invoice_seq = 380
    invoice_rows: list[tuple[Draft, uuid.UUID]] = []
    for draft in drafts:
        invoice_seq += 1
        invoice_id = uuid.uuid4()
        invoice_rows.append((draft, invoice_id))

        item_count = rng.int_between(1, 4)
        shares = split_into_items(draft.amount_cents, item_count)
        pool = _line_pool(draft.seed.industry)
        items = []
        for i, share in enumerate(shares):
            quantity = rng.int_between(1, 12)
            items.append(
                InvoiceItem(
                    id=uuid.uuid4(),
                    workspace_id=workspace_id,
                    invoice_id=invoice_id,
                    description=pool[i % len(pool)],
                    quantity=quantity,
                    unit_price_cents=share // quantity,
                    amount_cents=share,
                )
            )

        days_overdue = 0 if draft.status == "paid" else (NOW.date() - draft.due.date()).days

        last_contacted_at = None
        if days_overdue > 3:
            offset = rng.int_between(1, min(days_overdue, 21))
            last_contacted_at = NOW - timedelta(days=offset)

        po_number = None
        if rng.next() < 0.45:
            po_number = f"PO-{rng.int_between(10000, 99999)}"

        sent_at = None if draft.status == "draft" else draft.issue
        viewed_at = (
            draft.issue + timedelta(days=1)
            if draft.status in ("viewed", "partially_paid", "paid", "disputed")
            else None
        )

        session.add(
            Invoice(
                id=invoice_id,
                workspace_id=workspace_id,
                number=f"INV-{draft.issue.year}-{invoice_seq:05d}",
                customer_id=customer_ids[draft.customer_index],
                status=InvoiceStatus(draft.status),
                amount_cents=draft.amount_cents,
                paid_cents=draft.paid_cents,
                issue_date=draft.issue.date(),
                due_date=draft.due.date(),
                paid_date=draft.paid.date() if draft.paid else None,
                po_number=po_number,
                sent_at=sent_at,
                viewed_at=viewed_at,
                last_contacted_at=last_contacted_at,
                items=items,
            )
        )

    session.flush()

    for draft, invoice_id in invoice_rows:
        if draft.paid_cents <= 0:
            continue
        received_at = draft.paid if draft.paid else NOW - timedelta(days=rng.int_between(1, 20))
        session.add(
            Payment(
                id=uuid.uuid4(),
                workspace_id=workspace_id,
                invoice_id=invoice_id,
                customer_id=customer_ids[draft.customer_index],
                amount_cents=draft.paid_cents,
                method=rng.pick(METHODS),
                reference=f"{rng.pick(['TXN', 'REF', 'BAT'])}-{rng.int_between(100000, 999999)}",
                received_at=received_at,
            )
        )

    for draft, invoice_id in invoice_rows:
        if draft.status == "draft":
            continue

        customer_id = customer_ids[draft.customer_index]
        customer_name = draft.seed.name
        events: list[CollectionEvent] = []

        def push(type_: str, occurred_at: datetime, channel: str | None, actor: str, detail: str | None = None) -> None:
            events.append(
                CollectionEvent(
                    id=uuid.uuid4(),
                    workspace_id=workspace_id,
                    invoice_id=invoice_id,
                    customer_id=customer_id,
                    type=type_,
                    channel=channel,
                    summary=EVENT_SUMMARY[type_],
                    detail=detail,
                    actor=actor,
                    occurred_at=occurred_at,
                )
            )

        push("invoice_sent", draft.issue, "email", "InvoicePilot")
        if rng.next() < 0.82:
            push("invoice_viewed", draft.issue + timedelta(days=rng.int_between(1, 4)), "system", customer_name)

        days_overdue = 0 if draft.status == "paid" else (NOW.date() - draft.due.date()).days
        if days_overdue > 1:
            push("automation_ran", draft.due + timedelta(days=1), "system", "Friendly Payment Reminder", "Triggered 1 day after due date.")
            push("reminder_sent", draft.due + timedelta(days=1), "email", "InvoicePilot", f"Reminder sent to {customer_name} accounts payable.")
        if days_overdue > 9:
            push("reminder_sent", draft.due + timedelta(days=8), "email", "Priya Raman", "Second reminder, firmer tone.")
        if days_overdue > 22:
            push("call_logged", draft.due + timedelta(days=19), "phone", "Tom Okafor", "Left voicemail with AP; callback promised.")
        if days_overdue > 35:
            push("escalation_sent", draft.due + timedelta(days=32), "email", "Alex Mercer", "Escalated to finance director.")
        if draft.status == "disputed":
            push("dispute_raised", draft.due + timedelta(days=rng.int_between(2, 12)), "email", customer_name, "Line item quantity queried.")
        if draft.paid:
            push("payment_received", draft.paid, "system", "InvoicePilot")

        for event in events:
            session.add(event)

    return workspace_id
