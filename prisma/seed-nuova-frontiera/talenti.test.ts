import { describe, it, expect } from "vitest";
import {
  buildTalentoRequirements,
  resolveTalentoCategory,
  UnknownTalentiCategoriaError,
  type TalentoRow,
} from "./talenti";

function talento(overrides: Partial<TalentoRow>): TalentoRow {
  return {
    id: "1",
    nome: "Talento",
    descrizione: "",
    costo_exp: "0",
    id_talenti_categorie: "1",
    and_ids_talenti: "",
    or_ids_talenti: "",
    not_ids_talenti: "",
    status: "visibile",
    ...overrides,
  };
}

describe("buildTalentoRequirements", () => {
  it("costruisce archi AND individuali (requires, isOrGroup: false)", () => {
    const rows = [
      talento({ id: "1" }),
      talento({ id: "2", and_ids_talenti: "1" }),
    ];
    const { requirements, skipped } = buildTalentoRequirements(rows);
    expect(skipped).toEqual([]);
    expect(requirements).toEqual([
      {
        definitionCsvId: 2,
        requiredDefinitionCsvId: 1,
        type: "requires",
        isOrGroup: false,
      },
    ]);
  });

  it("costruisce un OR-group da or_ids_talenti (requires, isOrGroup: true)", () => {
    const rows = [
      talento({ id: "1" }),
      talento({ id: "2" }),
      talento({ id: "3", or_ids_talenti: "1,2" }),
    ];
    const { requirements } = buildTalentoRequirements(rows);
    expect(requirements).toEqual([
      {
        definitionCsvId: 3,
        requiredDefinitionCsvId: 1,
        type: "requires",
        isOrGroup: true,
      },
      {
        definitionCsvId: 3,
        requiredDefinitionCsvId: 2,
        type: "requires",
        isOrGroup: true,
      },
    ]);
  });

  it("costruisce archi blocks da not_ids_talenti", () => {
    const rows = [
      talento({ id: "1" }),
      talento({ id: "2", not_ids_talenti: "1" }),
    ];
    const { requirements } = buildTalentoRequirements(rows);
    expect(requirements).toEqual([
      {
        definitionCsvId: 2,
        requiredDefinitionCsvId: 1,
        type: "blocks",
        isOrGroup: false,
      },
    ]);
  });

  it("colleziona (invece di ignorare silenziosamente) i riferimenti a id non presenti tra le righe reali", () => {
    const rows = [
      talento({ id: "1", and_ids_talenti: "999" }),
      talento({ id: "2", or_ids_talenti: "998,1" }),
      talento({ id: "3", not_ids_talenti: "997" }),
    ];
    const { requirements, skipped } = buildTalentoRequirements(rows);

    expect(skipped).toEqual([
      {
        definitionCsvId: 1,
        requiredDefinitionCsvId: 999,
        field: "and_ids_talenti",
      },
      {
        definitionCsvId: 2,
        requiredDefinitionCsvId: 998,
        field: "or_ids_talenti",
      },
      {
        definitionCsvId: 3,
        requiredDefinitionCsvId: 997,
        field: "not_ids_talenti",
      },
    ]);
    // L'id "1" nello stesso or_ids_talenti risolve regolarmente, nonostante
    // "998" nello stesso campo non risolva.
    expect(requirements).toEqual([
      {
        definitionCsvId: 2,
        requiredDefinitionCsvId: 1,
        type: "requires",
        isOrGroup: true,
      },
    ]);
  });

  it("scarta l'intero OR-group (non solo l'arco collidente) quando un suo membro è già richiesto da and_ids_talenti", () => {
    // Riproduce "Cercatore" (nf-talento-183, T-040 round 1): and="28",
    // or="28,33" — l'id 33 non deve comparire come vincolo aggiuntivo,
    // perché l'intero OR-group è già soddisfatto dall'AND su 28.
    const rows = [
      talento({ id: "1" }), // and target
      talento({ id: "2" }), // membro extra dell'OR, non collidente
      talento({
        id: "3",
        and_ids_talenti: "1",
        or_ids_talenti: "1,2",
      }),
    ];
    const { requirements, skipped } = buildTalentoRequirements(rows);

    expect(skipped).toEqual([]);
    // Solo l'arco AND: nessuna riga per l'OR-group (né per "1", l'arco
    // collidente, né per "2", il membro extra che altrimenti risulterebbe
    // un vincolo indebito in più rispetto alla fonte CSV).
    expect(requirements).toEqual([
      {
        definitionCsvId: 3,
        requiredDefinitionCsvId: 1,
        type: "requires",
        isOrGroup: false,
      },
    ]);
  });

  it("nessun requisito per righe senza and/or/not", () => {
    const { requirements, skipped } = buildTalentoRequirements([
      talento({ id: "1" }),
    ]);
    expect(requirements).toEqual([]);
    expect(skipped).toEqual([]);
  });
});

describe("resolveTalentoCategory", () => {
  const categorie = [
    { id: "1", nome: "Generiche" },
    { id: "12", nome: "Classe Segreta - Cavalieri" },
  ];

  it("risolve il nome categoria dall'id CSV", () => {
    expect(
      resolveTalentoCategory(talento({ id_talenti_categorie: "12" }), categorie)
    ).toBe("Classe Segreta - Cavalieri");
  });

  it("solleva un errore esplicito per un id_talenti_categorie che non risolve", () => {
    expect(() =>
      resolveTalentoCategory(
        talento({ id_talenti_categorie: "999" }),
        categorie
      )
    ).toThrow(UnknownTalentiCategoriaError);
  });
});
