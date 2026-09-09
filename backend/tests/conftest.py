"""Test database lifecycle.

Each test runs inside a transaction that is rolled back afterwards, so tests
share one migrated database without sharing state. The alternative -- creating
a database per test -- costs seconds per test against a network Postgres.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Iterator

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def assert_test_database(url: str) -> None:
    """Refuse to run against anything not obviously a test database.

    The engine fixture downgrades to base before migrating. Aimed at a
    development database that is irreversible data loss, and the mistake is one
    stale environment variable away.
    """
    database_name = url.rsplit("/", 1)[-1].split("?")[0]
    if "test" not in database_name.lower():
        raise RuntimeError(
            f"{database_name!r} does not look like a test database. "
            "Point DATABASE_URL at one whose name contains 'test'."
        )


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    url = os.environ["DATABASE_URL"]
    assert_test_database(url)

    eng = create_engine(url)
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    command.downgrade(config, "base")
    command.upgrade(config, "head")

    yield eng
    eng.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    """A session whose work is discarded when the test ends.

    The outer transaction is never committed, so a test may call
    ``session.commit()`` freely -- it commits to the savepoint, not the
    database.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def workspace_id(db: Session) -> uuid.UUID:
    """A workspace to hang tenant-scoped fixtures from."""
    new_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO workspaces (id, name, slug, plan, currency) "
            "VALUES (:id, 'Test Workspace', :slug, 'starter', 'USD')"
        ),
        {"id": new_id, "slug": f"test-{new_id.hex[:8]}"},
    )
    db.flush()
    return new_id
