import { describe, it, expect } from "vitest";
import { buildCsv } from "./csv";

describe("buildCsv", () => {
  it("joins fields with commas and rows with CRLF", () => {
    const csv = buildCsv([
      ["Nome", "Tipo"],
      ["Aria", "PG"],
    ]);

    expect(csv).toBe("Nome,Tipo\r\nAria,PG");
  });

  it("quotes fields containing commas, quotes or newlines", () => {
    const csv = buildCsv([
      ["Nome, con virgola", 'Con "virgolette"', "Con\nnewline"],
    ]);

    expect(csv).toBe('"Nome, con virgola","Con ""virgolette""","Con\nnewline"');
  });

  it("leaves plain fields untouched", () => {
    expect(buildCsv([["Umano", "Aibelir"]])).toBe("Umano,Aibelir");
  });
});
