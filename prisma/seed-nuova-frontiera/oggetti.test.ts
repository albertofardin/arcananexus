import { describe, it, expect } from "vitest";
import {
  resolveOggettoDataTypeName,
  buildOggettoDescription,
  UnknownCategoriaError,
  OGGETTI_DATATYPE_NAMES,
  type OggettoRow,
} from "./oggetti";

function row(overrides: Partial<OggettoRow>): OggettoRow {
  return {
    id: "1",
    nome: "Acqua pura",
    categoria: "ingrediente",
    tipologia: "",
    rarita: "-nessuno-",
    descrizione: "Fluido trasparente",
    status: "nascosto",
    ...overrides,
  };
}

describe("resolveOggettoDataTypeName", () => {
  it("mappa ciascuna categoria reale al suo DataType", () => {
    expect(resolveOggettoDataTypeName(row({ categoria: "ingrediente" }))).toBe(
      "Ingredienti"
    );
    expect(resolveOggettoDataTypeName(row({ categoria: "oggetto" }))).toBe(
      "Oggetti"
    );
    expect(resolveOggettoDataTypeName(row({ categoria: "-nessuno-" }))).toBe(
      "Oggetti"
    );
    expect(
      resolveOggettoDataTypeName(row({ categoria: "oggetto incantato" }))
    ).toBe("Oggetti Incantati");
    expect(resolveOggettoDataTypeName(row({ categoria: "droga" }))).toBe(
      "Droghe"
    );
    expect(resolveOggettoDataTypeName(row({ categoria: "malattia" }))).toBe(
      "Malattie"
    );
    expect(
      resolveOggettoDataTypeName(row({ categoria: "tonico da battaglia" }))
    ).toBe("Tonici da Battaglia");
    expect(resolveOggettoDataTypeName(row({ categoria: "speciale" }))).toBe(
      "Oggetti Speciali"
    );
    expect(resolveOggettoDataTypeName(row({ categoria: "maledizione" }))).toBe(
      "Maledizioni"
    );
  });

  it("le due categorie residuali (-nessuno-/oggetto) confluiscono nello stesso DataType", () => {
    expect(OGGETTI_DATATYPE_NAMES).toHaveLength(8);
  });

  it("solleva un errore esplicito per una categoria non mappata", () => {
    expect(() =>
      resolveOggettoDataTypeName(row({ categoria: "categoria-inventata" }))
    ).toThrow(UnknownCategoriaError);
  });
});

describe("buildOggettoDescription", () => {
  it("usa solo la descrizione quando tipologia e rarità sono assenti", () => {
    expect(
      buildOggettoDescription(
        row({
          descrizione: "Fluido trasparente",
          tipologia: "",
          rarita: "-nessuno-",
        })
      )
    ).toBe("Fluido trasparente");
  });

  it("aggiunge la tipologia quando presente", () => {
    expect(
      buildOggettoDescription(
        row({
          descrizione: "Trappola.",
          tipologia: "trappola",
          rarita: "-nessuno-",
        })
      )
    ).toBe("Trappola.\nTipologia: trappola");
  });

  it("mappa la rarità in etichetta italiana", () => {
    expect(
      buildOggettoDescription(
        row({ descrizione: "Pozione.", tipologia: "", rarita: "R" })
      )
    ).toBe("Pozione.\nRarità: Raro");
  });

  it("compone tutti e tre i pezzi quando presenti", () => {
    expect(
      buildOggettoDescription(
        row({ descrizione: "Un oggetto.", tipologia: "pozione", rarita: "L" })
      )
    ).toBe("Un oggetto.\nTipologia: pozione\nRarità: Leggendario");
  });

  it("ignora una rarità non mappata (dato ignoto, non -nessuno-)", () => {
    expect(
      buildOggettoDescription(
        row({ descrizione: "Boh.", tipologia: "", rarita: "???" })
      )
    ).toBe("Boh.");
  });
});
