import { describe, it, expect } from "vitest";
import {
  readTalentFlags,
  getTalentRepetitionStatus,
  incrementTalentCount,
  decrementTalentCount,
  totalTalentCount,
  expandTalentCounts,
  sumTalentCost,
} from "./talentRepetition";

describe("readTalentFlags", () => {
  it("reads maxRepetitions alongside the existing flags", () => {
    expect(
      readTalentFlags({
        cost: 5,
        repeatable: true,
        maxRepetitions: 3,
        creationOnly: false,
      })
    ).toEqual({
      cost: 5,
      repeatable: true,
      maxRepetitions: 3,
      creationOnly: false,
    });
  });

  it("leaves maxRepetitions undefined when absent or malformed", () => {
    expect(
      readTalentFlags({ repeatable: true }).maxRepetitions
    ).toBeUndefined();
    expect(
      readTalentFlags({ repeatable: true, maxRepetitions: "3" }).maxRepetitions
    ).toBeUndefined();
  });
});

describe("getTalentRepetitionStatus", () => {
  it("caps a non-repeatable talent at 1, regardless of maxRepetitions", () => {
    const status = getTalentRepetitionStatus(
      { repeatable: false, maxRepetitions: 5 },
      0
    );
    expect(status).toEqual({
      count: 0,
      max: 1,
      atLimit: false,
      canAcquireMore: true,
      badgeLabel: undefined,
    });
    expect(getTalentRepetitionStatus({ repeatable: false }, 1).atLimit).toBe(
      true
    );
  });

  it("has no ceiling for a repeatable talent without maxRepetitions", () => {
    const status = getTalentRepetitionStatus({ repeatable: true }, 50);
    expect(status.max).toBeUndefined();
    expect(status.atLimit).toBe(false);
    expect(status.canAcquireMore).toBe(true);
    expect(status.badgeLabel).toBeUndefined();
  });

  it("blocks a repeatable talent once count reaches maxRepetitions, with a count/max badge", () => {
    const below = getTalentRepetitionStatus(
      { repeatable: true, maxRepetitions: 3 },
      2
    );
    expect(below.atLimit).toBe(false);
    expect(below.canAcquireMore).toBe(true);
    expect(below.badgeLabel).toBe("2/3");

    const atCap = getTalentRepetitionStatus(
      { repeatable: true, maxRepetitions: 3 },
      3
    );
    expect(atCap.atLimit).toBe(true);
    expect(atCap.canAcquireMore).toBe(false);
    expect(atCap.badgeLabel).toBe("3/3");
  });
});

describe("talent count map helpers", () => {
  it("incrementTalentCount adds one without mutating the original map", () => {
    const original = new Map([[1, 1]]);
    const next = incrementTalentCount(original, 1);
    const withNewId = incrementTalentCount(original, 2);

    expect(original.get(1)).toBe(1);
    expect(next.get(1)).toBe(2);
    expect(withNewId.get(2)).toBe(1);
  });

  it("decrementTalentCount removes the key entirely once it reaches zero", () => {
    const twice = new Map([[1, 2]]);
    const once = decrementTalentCount(twice, 1);
    const zero = decrementTalentCount(once, 1);

    expect(once.get(1)).toBe(1);
    expect(zero.has(1)).toBe(false);
  });

  it("decrementTalentCount on a missing id is a no-op (still absent)", () => {
    const result = decrementTalentCount(new Map(), 1);
    expect(result.has(1)).toBe(false);
  });

  it("totalTalentCount sums every entry", () => {
    expect(
      totalTalentCount(
        new Map([
          [1, 2],
          [2, 3],
        ])
      )
    ).toBe(5);
    expect(totalTalentCount(new Map())).toBe(0);
  });

  it("expandTalentCounts repeats each id by its count", () => {
    const expanded = expandTalentCounts(
      new Map([
        [5, 3],
        [7, 1],
      ])
    );
    expect(expanded.filter(id => id === 5)).toHaveLength(3);
    expect(expanded.filter(id => id === 7)).toHaveLength(1);
    expect(expanded).toHaveLength(4);
  });

  it("sumTalentCost multiplies each entry's cost by its count, ignoring unselected entries", () => {
    const entries = [
      { id: 1, flags: { cost: 5 } },
      { id: 2, flags: { cost: 10 } },
      { id: 3, flags: {} },
    ];
    const counts = new Map([
      [1, 3],
      [3, 1],
    ]);

    expect(sumTalentCost(entries, counts)).toBe(15);
  });
});
