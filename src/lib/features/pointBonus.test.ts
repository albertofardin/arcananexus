import { describe, expect, it } from "vitest";
import { pointBonusSchema, sumPointBonuses } from "./pointBonus";

const bonuses = [
  { characterId: 1, points: 2, reason: "a" },
  { characterId: 1, points: -1, reason: "b" },
  { characterId: 2, points: 5, reason: "c" },
];

describe("pointBonus", () => {
  it("somma bonus e malus del solo personaggio richiesto", () => {
    expect(sumPointBonuses(bonuses, 1)).toBe(1);
    expect(sumPointBonuses(bonuses, 3)).toBe(0);
  });

  it("rifiuta valore 0 e motivazione vuota", () => {
    expect(
      pointBonusSchema.safeParse({ characterId: 1, points: 0, reason: "x" })
        .success
    ).toBe(false);
    expect(
      pointBonusSchema.safeParse({ characterId: 1, points: 1, reason: " " })
        .success
    ).toBe(false);
  });
});
