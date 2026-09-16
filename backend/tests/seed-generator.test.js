/**
 * The generator half of the seeder: no database, no clock beyond the anchor it
 * is handed.
 *
 * The RNG parity numbers are the ones the Python port asserted
 * (tests/test_rng.py), produced by running the mulberry32 in
 * src/lib/data/seed.ts under node. If they change, the demo ledger is a
 * different ledger and every screenshot in the repository is stale.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CUSTOMER_SEEDS,
  INVOICE_COUNT,
  SEED,
  anchorDate,
  buildDrafts,
  dayDiff,
  isoDate,
  makeRng,
  mulberry32,
  splitIntoItems,
} from "../src/db/seed.js";

const EXPECTED_FIRST_FIVE = [
  0.1912623210810125,
  0.23377290950156748,
  0.9647377305664122,
  0.8688520358409733,
  0.06411144742742181,
];

describe("mulberry32", () => {
  it("matches the generator src/lib/data/seed.ts uses", () => {
    const rnd = mulberry32(SEED);
    for (const want of EXPECTED_FIRST_FIVE) {
      assert.ok(Math.abs(rnd() - want) < 1e-12);
    }
  });

  it("is a pure function of its seed", () => {
    const a = mulberry32(SEED);
    const b = mulberry32(SEED);
    assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  });
});

describe("the rng helpers", () => {
  it("picks inside the array and stays inside the bounds", () => {
    const rng = makeRng(SEED);
    for (let i = 0; i < 500; i += 1) {
      assert.ok(["a", "b", "c"].includes(rng.pick(["a", "b", "c"])));
      const n = rng.intBetween(3, 7);
      assert.ok(Number.isInteger(n) && n >= 3 && n <= 7, `got ${n}`);
      const f = rng.between(-1, 1);
      assert.ok(f >= -1 && f < 1);
    }
  });
});

describe("anchorDate", () => {
  it("is the given day at 09:12 UTC", () => {
    const anchor = anchorDate(new Date("2026-09-16T23:45:00.000Z"));
    assert.equal(anchor.toISOString(), "2026-09-16T09:12:00.000Z");
  });
});

describe("splitIntoItems", () => {
  it("splits a total so the parts sum to it exactly", () => {
    // The remainder goes on the last item. Rounding each part independently
    // leaves cents unaccounted for and the line-items invariant fails.
    for (const [total, count] of [[100_003, 3], [48_000, 1], [7, 4]]) {
      const parts = splitIntoItems(total, count);
      assert.equal(parts.length, count);
      assert.equal(parts.reduce((sum, part) => sum + part, 0), total);
    }
  });
});

describe("the customer table", () => {
  it("is the forty accounts the demo book is built from", () => {
    assert.equal(CUSTOMER_SEEDS.length, 40);
    assert.equal(new Set(CUSTOMER_SEEDS.map((s) => s.domain)).size, 40);
    for (const seed of CUSTOMER_SEEDS) {
      assert.ok(seed.reliability > 0 && seed.reliability <= 1);
      assert.ok([14, 30, 45, 60].includes(seed.terms));
    }
  });
});

describe("buildDrafts", () => {
  const now = anchorDate(new Date("2026-09-16T00:00:00.000Z"));
  const drafts = buildDrafts(makeRng(SEED), now);

  it("builds the whole ledger", () => {
    assert.equal(drafts.length, INVOICE_COUNT);
  });

  it("is reproducible from the seed", () => {
    const again = buildDrafts(makeRng(SEED), now);
    assert.deepEqual(JSON.stringify(again), JSON.stringify(drafts));
  });

  it("runs in chronological order, so invoice numbers do too", () => {
    for (let i = 1; i < drafts.length; i += 1) {
      assert.ok(drafts[i - 1].issue <= drafts[i].issue);
    }
  });

  it("never bills less than the floor, and never in fractional cents", () => {
    for (const draft of drafts) {
      assert.ok(Number.isSafeInteger(draft.amountCents));
      assert.ok(draft.amountCents >= 48_000);
    }
  });

  it("never records more paid than billed", () => {
    for (const draft of drafts) {
      assert.ok(draft.paidCents >= 0 && draft.paidCents <= draft.amountCents);
    }
  });

  it("settles a paid invoice in full, with a date, in the past", () => {
    for (const draft of drafts.filter((d) => d.status === "paid")) {
      assert.equal(draft.paidCents, draft.amountCents);
      assert.ok(draft.paid instanceof Date);
      assert.ok(draft.paid <= now);
    }
  });

  it("leaves a paid date on nothing else", () => {
    for (const draft of drafts.filter((d) => d.status !== "paid")) {
      assert.equal(draft.paid, null);
    }
  });

  it("issues nothing in the future and dues nothing before issue", () => {
    for (const draft of drafts) {
      assert.ok(draft.issue <= now);
      assert.ok(draft.due >= draft.issue);
    }
  });

  it("produces a book with every status in it", () => {
    // A ledger of one status demonstrates one screen.
    assert.deepEqual(
      [...new Set(drafts.map((d) => d.status))].sort(),
      ["disputed", "draft", "paid", "partially_paid", "sent", "viewed"],
    );
  });

  it("leaves real delinquency behind, not a self-cleaning book", () => {
    const stillOpen = drafts.filter(
      (d) => d.status !== "paid" && d.status !== "draft" && dayDiff(now, d.due) > 90,
    );
    assert.ok(stillOpen.length > 10, `only ${stillOpen.length} over 90 days`);
  });
});

describe("isoDate", () => {
  it("is the calendar day, for a date column", () => {
    assert.equal(isoDate(new Date("2026-09-16T09:12:00.000Z")), "2026-09-16");
  });
});
