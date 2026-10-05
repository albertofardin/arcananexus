import { describe, it, expect } from "vitest";
import { DataVisibility } from "@prisma/client";
import {
  readTalentCategory,
  groupTalentsByCategory,
  NO_CATEGORY_LABEL,
  readTalentFlags,
  type TalentAccordionEntry,
} from ".";

const buildEntry = (
  overrides: Partial<TalentAccordionEntry> = {}
): TalentAccordionEntry => ({
  id: 1,
  name: "Voce",
  description: null,
  visibility: DataVisibility.visible,
  flags: {},
  ...overrides,
});

describe("readTalentCategory", () => {
  it("returns the category string when flags is a plain object with a string category", () => {
    expect(readTalentCategory({ category: "Combattimento" })).toBe(
      "Combattimento"
    );
  });

  it("trims surrounding whitespace", () => {
    expect(readTalentCategory({ category: "  Sopravvivenza  " })).toBe(
      "Sopravvivenza"
    );
  });

  it("returns an empty string when category is absent", () => {
    expect(readTalentCategory({ cost: 5 })).toBe("");
  });

  it("returns an empty string when flags is null/undefined/not an object", () => {
    expect(readTalentCategory(null)).toBe("");
    expect(readTalentCategory(undefined)).toBe("");
    expect(readTalentCategory("not an object")).toBe("");
  });

  it("returns an empty string when category is present but not a string (malformed flags)", () => {
    expect(readTalentCategory({ category: 42 })).toBe("");
  });
});

describe("readTalentFlags", () => {
  it("reads cost/repeatable/creationOnly when well-typed", () => {
    expect(
      readTalentFlags({ cost: 5, repeatable: true, creationOnly: false })
    ).toEqual({ cost: 5, repeatable: true, creationOnly: false });
  });

  it("omits fields that are missing or of the wrong type", () => {
    expect(readTalentFlags({ cost: "5" })).toEqual({
      cost: undefined,
      repeatable: undefined,
      creationOnly: undefined,
    });
    expect(readTalentFlags(null)).toEqual({});
    expect(readTalentFlags(undefined)).toEqual({});
  });
});

describe("groupTalentsByCategory", () => {
  it("raggruppa le voci per categoria, ordinando alfabeticamente sia le categorie sia le voci al loro interno, con 'Senza categoria' sempre in coda", () => {
    const entries = [
      buildEntry({ id: 1, name: "Zeta", flags: { category: "Combattimento" } }),
      buildEntry({
        id: 2,
        name: "Alpha",
        flags: { category: "Combattimento" },
      }),
      buildEntry({ id: 3, name: "Beta", flags: { category: "Sopravvivenza" } }),
      buildEntry({ id: 4, name: "Senza Nome", flags: {} }),
    ];

    const groups = groupTalentsByCategory(entries);

    expect(groups.map(g => g.label)).toEqual([
      "Combattimento",
      "Sopravvivenza",
      NO_CATEGORY_LABEL,
    ]);
    expect(groups[0].entries.map(e => e.name)).toEqual(["Alpha", "Zeta"]);
    expect(groups[1].entries.map(e => e.name)).toEqual(["Beta"]);
    expect(groups[2].entries.map(e => e.name)).toEqual(["Senza Nome"]);
  });

  it("returns an empty array for no entries", () => {
    expect(groupTalentsByCategory([])).toEqual([]);
  });
});
