from __future__ import annotations

from typing import Generic, Sequence, TypeVar
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.base import WorkspaceScoped

ModelT = TypeVar("ModelT", bound=WorkspaceScoped)


class WorkspaceRepository(Generic[ModelT]):
    """Base class for every tenant-scoped repository.

    Multi-tenancy is enforced here and only here. ``_query`` is the single way
    to build a statement, and it always applies ``workspace_id``. An endpoint
    cannot forget the filter, because an endpoint never writes the filter --
    which is the difference between a tenancy bug being possible and being
    impossible by construction.
    """

    model: type[ModelT]

    def __init__(self, session: Session, workspace_id: UUID) -> None:
        self.session = session
        self.workspace_id = workspace_id

    def _query(self) -> Select[tuple[ModelT]]:
        return select(self.model).where(self.model.workspace_id == self.workspace_id)

    def get(self, record_id: UUID) -> ModelT | None:
        stmt = self._query().where(self.model.id == record_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def list(self, *, limit: int = 50, offset: int = 0) -> Sequence[ModelT]:
        stmt = self._query().limit(min(limit, 200)).offset(offset)
        return self.session.execute(stmt).scalars().all()

    def add(self, record: ModelT) -> ModelT:
        # Assigned rather than trusted: a payload that carries its own
        # workspace_id must never be able to write into another tenant.
        record.workspace_id = self.workspace_id
        self.session.add(record)
        self.session.flush()
        return record

    def delete(self, record_id: UUID) -> bool:
        record = self.get(record_id)
        if record is None:
            return False
        self.session.delete(record)
        return True
