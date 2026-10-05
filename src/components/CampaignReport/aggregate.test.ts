import { describe, it, expect } from "vitest";
import {
  discoverCategories,
  countByCategory,
  countByStatus,
  countTalents,
} from "./aggregate";
import type { ReportCharacterRow } from "./types";

function makeRow(
  overrides: Partial<ReportCharacterRow> = {}
): ReportCharacterRow {
  return {
    id: 1,
    name: "Test",
    type: "pg",
    userName: "Player",
    avatar: null,
    lastUpdateDate: "2026-01-01T00:00:00.000Z",
    approvalDate: null,
    parkDate: null,
    deathDate: null,
    data: [],
    talents: [],
    ...overrides,
  };
}

describe("discoverCategories", () => {
  it("collects distinct data types from every row, sorted by id", () => {
    const rows = [
      makeRow({
        data: [
          {
            dataTypeId: 2,
            dataTypeName: "Fazione",
            referenceDataName: "Aibelir",
          },
        ],
      }),
      makeRow({
        data: [
          { dataTypeId: 1, dataTypeName: "Razza", referenceDataName: "Umano" },
        ],
      }),
    ];

    expect(discoverCategories(rows)).toEqual([
      { dataTypeId: 1, name: "Razza" },
      { dataTypeId: 2, name: "Fazione" },
    ]);
  });

  it("returns an empty list when no character has data", () => {
    expect(discoverCategories([makeRow()])).toEqual([]);
  });
});

describe("countByCategory", () => {
  it("counts characters per reference data value, sorted descending", () => {
    const rows = [
      makeRow({
        id: 1,
        data: [
          { dataTypeId: 1, dataTypeName: "Razza", referenceDataName: "Umano" },
        ],
      }),
      makeRow({
        id: 2,
        data: [
          { dataTypeId: 1, dataTypeName: "Razza", referenceDataName: "Elfo" },
        ],
      }),
      makeRow({
        id: 3,
        data: [
          { dataTypeId: 1, dataTypeName: "Razza", referenceDataName: "Umano" },
        ],
      }),
    ];

    expect(countByCategory(rows, 1)).toEqual([
      { id: "Umano", label: "Umano", count: 2 },
      { id: "Elfo", label: "Elfo", count: 1 },
    ]);
  });

  it("buckets characters without an assignment as Non assegnato", () => {
    const rows = [
      makeRow({
        id: 1,
        data: [
          { dataTypeId: 1, dataTypeName: "Razza", referenceDataName: "Umano" },
        ],
      }),
      makeRow({ id: 2, data: [] }),
    ];

    expect(countByCategory(rows, 1)).toEqual([
      { id: "Umano", label: "Umano", count: 1 },
      { id: "__unassigned", label: "Non assegnato", count: 1 },
    ]);
  });
});

describe("countByStatus", () => {
  it("always returns all four statuses, even at zero", () => {
    const rows = [
      makeRow({ approvalDate: "2024-01-01T00:00:00.000Z" }),
      makeRow({
        approvalDate: "2024-01-01T00:00:00.000Z",
        deathDate: "2024-02-01T00:00:00.000Z",
      }),
    ];

    expect(countByStatus(rows)).toEqual([
      { id: "approved", label: "Attivo", count: 1 },
      { id: "review", label: "In Revisione", count: 0 },
      { id: "parked", label: "In Pausa", count: 0 },
      { id: "dead", label: "Deceduto", count: 1 },
    ]);
  });
});

describe("countTalents", () => {
  it("counts how many rows include each talent (a row can count for more than one)", () => {
    const rows = [
      makeRow({ id: 1, talents: ["Guida", "Combattimento"] }),
      makeRow({ id: 2, talents: ["Guida"] }),
      makeRow({ id: 3, talents: [] }),
    ];

    const counts = countTalents(rows);
    expect(counts.get("Guida")).toBe(2);
    expect(counts.get("Combattimento")).toBe(1);
    expect(counts.has("Furtività")).toBe(false);
  });

  it("counts a character once even when a repeatable talent is taken twice", () => {
    const counts = countTalents([makeRow({ talents: ["Guida", "Guida"] })]);
    expect(counts.get("Guida")).toBe(1);
  });
});
