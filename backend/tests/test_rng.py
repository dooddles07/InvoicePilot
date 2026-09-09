"""The RNG must match JavaScript exactly or the demo ledger is not reproducible."""

from __future__ import annotations

import pytest

from app.seeds.rng import js_round, mulberry32

# Produced by running the mulberry32 in src/lib/data/seed.ts under node.
EXPECTED_FIRST_FIVE = [
    0.1912623210810125,
    0.23377290950156748,
    0.9647377305664122,
    0.8688520358409733,
    0.06411144742742181,
]


def test_matches_the_javascript_generator() -> None:
    rnd = mulberry32(0x0001_9F0C)
    produced = [rnd() for _ in range(5)]
    for got, want in zip(produced, EXPECTED_FIRST_FIVE, strict=True):
        assert got == pytest.approx(want, abs=1e-12)


def test_js_round_rounds_half_upward_not_to_even() -> None:
    # Python's round(2.5) is 2. JavaScript's Math.round(2.5) is 3. Every
    # invoice amount in the seeder goes through this.
    assert js_round(2.5) == 3
    assert js_round(3.5) == 4
    assert js_round(-2.5) == -2
    assert js_round(2.4) == 2
