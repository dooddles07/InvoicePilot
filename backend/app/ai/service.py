from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal, Sequence
from uuid import UUID

ActionKind = Literal["send_reminder", "send_escalation", "schedule_call", "flag_review"]


@dataclass(frozen=True, slots=True)
class Recommendation:
    """Something the AI thinks should happen. Not something that has happened.

    There is no ``execute`` on this object by design. The service layer returns
    recommendations; a separate, human-confirmed endpoint performs the action
    and writes the audit entry. Nothing in the AI path can send an email or
    move money on its own.
    """

    invoice_id: UUID
    customer_id: UUID
    priority: int
    headline: str
    reasoning: str
    action_kind: ActionKind
    confidence: float
    requires_confirmation: Literal[True] = True


@dataclass(frozen=True, slots=True)
class RiskAssessment:
    customer_id: UUID
    level: Literal["low", "medium", "high"]
    score: Decimal
    # The driver that produced the grade, in plain language. A risk score a
    # finance manager cannot explain to a customer is a score they will not act
    # on.
    reason: str


class AIService(ABC):
    """The contract every provider implements.

    Keeping this abstract is what makes the AI layer optional: with
    ``ai_provider=disabled`` the application returns deterministic rankings and
    every screen still works. The product degrades to "sorted sensibly", never
    to "broken".
    """

    @abstractmethod
    def rank_collections(
        self, workspace_id: UUID, *, limit: int = 5
    ) -> Sequence[Recommendation]:
        """Rank open invoices by expected recovery, not by size."""

    @abstractmethod
    def assess_customer_risk(self, customer_id: UUID) -> RiskAssessment:
        """Grade an account from its own payment history."""

    @abstractmethod
    def draft_reminder(
        self, invoice_id: UUID, *, tone: Literal["friendly", "firm", "final"]
    ) -> str:
        """Draft a reminder. The caller decides whether it is ever sent."""

    @abstractmethod
    def answer_question(self, workspace_id: UUID, question: str) -> dict[str, object]:
        """Answer a question about the ledger as structured data.

        Structured rather than prose so the UI can render figures, link to the
        records behind them, and let a person verify the claim against a table.
        """


class DeterministicAIService(AIService):
    """The no-provider implementation.

    Ranking is ``balance x risk weight x exp(-days_overdue / 55)``: the same
    expected-recovery ordering the product uses everywhere, computed in SQL. It
    is also the baseline any model-backed provider has to beat.
    """

    RISK_WEIGHT = {"low": 1.0, "medium": 1.6, "high": 2.4}

    def rank_collections(
        self, workspace_id: UUID, *, limit: int = 5
    ) -> Sequence[Recommendation]:
        raise NotImplementedError("Wire to InvoiceRepository.rank_by_expected_recovery")

    def assess_customer_risk(self, customer_id: UUID) -> RiskAssessment:
        raise NotImplementedError("Derive from on-time rate and oldest open balance")

    def draft_reminder(
        self, invoice_id: UUID, *, tone: Literal["friendly", "firm", "final"]
    ) -> str:
        raise NotImplementedError("Render the workspace email template for this tone")

    def answer_question(self, workspace_id: UUID, question: str) -> dict[str, object]:
        raise NotImplementedError("Route to the reporting service")
