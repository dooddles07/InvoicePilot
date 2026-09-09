"""The guard that stops a test run from destroying a development database."""

from __future__ import annotations

import pytest

from tests.conftest import assert_test_database


def test_accepts_a_database_named_for_testing() -> None:
    assert_test_database("postgresql+psycopg://u:p@host/invoicepilot_test")


def test_rejects_a_database_that_is_not_named_for_testing() -> None:
    # The fixture drops every table before it migrates. Pointed at a
    # development database that is data loss, not a failing test.
    with pytest.raises(RuntimeError, match="does not look like a test database"):
        assert_test_database("postgresql+psycopg://u:p@host/invoicepilot")
