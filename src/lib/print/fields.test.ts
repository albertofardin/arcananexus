import { describe, it, expect } from "vitest";
import {
  buildInputs,
  characterFields,
  computePlacements,
  htmlToText,
  SHEET_SIZES,
  uniqueFieldName,
} from "./fields";

describe("print fields", () => {
  it("fills catalog fields from the row and free fields from their content", () => {
    const template = {
      schemas: [
        [
          { name: "Nome", content: "Nome" },
          { name: "Nome (2)", content: "Nome" },
          { name: "Titolo", content: "AREA SPECIALE" },
          { name: "Logo", content: "data:logo", readOnly: true },
        ],
      ],
    };

    const inputs = buildInputs(template, [{ Nome: "Aldric" }, { Nome: "" }]);

    expect(inputs).toEqual([
      { Nome: "Aldric", "Nome (2)": "Aldric", Titolo: "AREA SPECIALE" },
      // Un valore vuoto della riga resta vuoto: non ristampa l'etichetta.
      { Nome: "", "Nome (2)": "", Titolo: "AREA SPECIALE" },
    ]);
  });

  it("passes the whole row as variables for fixed texts like **{Nome}**", () => {
    const template = { schemas: [[{ name: "Titolo", readOnly: true }]] };
    expect(buildInputs(template, [{ Nome: "Aldric" }])).toEqual([
      { Nome: "Aldric" },
    ]);
  });

  it("numbers repeated field names", () => {
    expect(uniqueFieldName("Nome", [])).toBe("Nome");
    expect(uniqueFieldName("Nome", ["Nome", "Nome (2)"])).toBe("Nome (3)");
  });

  it("adds one field per data type without shadowing the fixed ones", () => {
    const keys = characterFields(["Razza", "Nome"]).map(f => f.key);
    expect(keys.filter(k => k === "Nome")).toHaveLength(1);
    expect(keys).toContain("Razza");
  });

  it("converts rich text HTML to plain text", () => {
    expect(
      htmlToText("<p>Uno &amp; due</p><ul><li>a</li><li>b</li></ul>")
    ).toBe("Uno & due\n• a\n• b");
    expect(htmlToText(null)).toBe("");
  });

  it("tiles 9 playing cards on one A4 portrait sheet, the 10th on a new one", () => {
    const cards = Array.from(
      { length: 10 },
      () => [63, 88] as [number, number]
    );

    const placements = computePlacements(cards, SHEET_SIZES.a4_portrait);

    expect(placements.slice(0, 9).every(p => p.sheet === 0)).toBe(true);
    expect(placements[9]).toMatchObject({ sheet: 1, x: 5, y: 5, scale: 1 });
    // Terza carta della prima riga, prima della seconda riga.
    expect(placements[2]).toMatchObject({ x: 5 + 2 * (63 + 3), y: 5 });
    expect(placements[3]).toMatchObject({ x: 5, y: 5 + 88 + 3 });
  });

  it("places 50×50 cards side by side with no gap and no margin", () => {
    const cards = Array.from({ length: 5 }, () => [50, 50] as [number, number]);

    const placements = computePlacements(cards, SHEET_SIZES.a4_portrait, {
      margin: 0,
      gap: 0,
    });

    // 4 per riga su 210 mm, la quinta va a capo a contatto con la prima.
    expect(placements.map(p => [p.x, p.y])).toEqual([
      [0, 0],
      [50, 0],
      [100, 0],
      [150, 0],
      [0, 50],
    ]);
  });

  it("uses custom gap and margin between cards and from the sheet edge", () => {
    const cards = Array.from({ length: 4 }, () => [50, 50] as [number, number]);

    const placements = computePlacements(cards, SHEET_SIZES.a4_portrait, {
      margin: 10,
      gap: 20,
    });

    // 10 + 50 + 20 + 50 + 20 + 50 = 200 ≤ 200 (210 − 10): 3 per riga.
    expect(placements.map(p => [p.x, p.y])).toEqual([
      [10, 10],
      [80, 10],
      [150, 10],
      [10, 80],
    ]);
  });

  it("shrinks a card bigger than the sheet", () => {
    const [p] = computePlacements([[420, 297]], SHEET_SIZES.a4_portrait);
    expect(p.sheet).toBe(0);
    expect(p.scale).toBeCloseTo(200 / 420);
  });
});
