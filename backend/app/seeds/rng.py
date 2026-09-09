"""JavaScript-compatible deterministic randomness.

Ported from ``src/lib/data/seed.ts``. Every operation is masked to unsigned
32-bit because that is what the JavaScript original does implicitly, and a
Python integer that grows past 32 bits diverges silently after the first few
draws.
"""

from __future__ import annotations

import math
from typing import Callable, Sequence, TypeVar

T = TypeVar("T")

MASK32 = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    """``Math.imul``: 32-bit integer multiply, keeping the low 32 bits."""
    return ((a & MASK32) * (b & MASK32)) & MASK32


def mulberry32(seed: int) -> Callable[[], float]:
    state = seed & MASK32

    def rnd() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & MASK32
        t = state
        t = _imul(t ^ (t >> 15), t | 1)
        t = (t ^ (t + _imul(t ^ (t >> 7), t | 61))) & MASK32
        return ((t ^ (t >> 14)) & MASK32) / 4294967296

    return rnd


def js_round(x: float) -> int:
    """``Math.round``: ties go toward positive infinity.

    Python's built-in rounds ties to even, so ``round(2.5)`` is 2 while
    JavaScript gives 3. Invoice amounts are rounded, so the difference is
    money.
    """
    return math.floor(x + 0.5)


class Rng:
    """The helper set from seed.ts, bound to one generator."""

    def __init__(self, seed: int) -> None:
        self._rnd = mulberry32(seed)

    def next(self) -> float:
        return self._rnd()

    def pick(self, items: Sequence[T]) -> T:
        return items[math.floor(self._rnd() * len(items))]

    def between(self, lo: float, hi: float) -> float:
        return lo + self._rnd() * (hi - lo)

    def int_between(self, lo: int, hi: int) -> int:
        return math.floor(self.between(lo, hi + 1))
