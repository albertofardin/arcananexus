import { describe, it, expect } from "vitest";
import { DataVisibility } from "@prisma/client";
import {
  buildTalentsCsv,
  diffTalentsCsv,
  parseTalentsCsv,
  readTalentFlags,
  type ParsedTalentRow,
} from "../talentsCsv";
import type { ContentEntry } from "../types";

function makeEntry(overrides: Partial<ContentEntry> = {}): ContentEntry {
  return {
    id: 1,
    name: "Fendente",
    description: "Un colpo netto",
    visibility: DataVisibility.visible,
    flags: {
      category: "Combattimento",
      cost: 3,
      repeatable: true,
      maxRepetitions: 4,
      creationOnly: false,
      isDowntimeUsable: true,
      isMissivePointBonus: true,
      isDowntimePointBonus: false,
    },
    ...overrides,
  };
}

describe("readTalentFlags", () => {
  it("legge tutti gli attributi, incluso maxRepetitions assente", () => {
    expect(readTalentFlags({ cost: 2 })).toEqual({
      category: "",
      cost: 2,
      repeatable: false,
      maxRepetitions: undefined,
      creationOnly: false,
      isDowntimeUsable: false,
      isMissivePointBonus: false,
      isDowntimePointBonus: false,
    });
  });
});

describe("buildTalentsCsv", () => {
  it("esporta tutti gli attributi del talento in colonne dedicate", () => {
    const csv = buildTalentsCsv([makeEntry()]);
    const [header, row] = csv.split("\r\n");
    expect(header.split(",")).toEqual([
      "Nome",
      "Descrizione",
      "Listato",
      "Costo",
      "Ripetibile",
      "Max ripetizioni",
      "Solo in creazione",
      "Usabile come downtime",
      "Bonus missiva",
      "Bonus downtime",
      "Visibilità",
      "Regola: Richiede",
      "Regola: Blocca",
      "Regola: Visibile con",
      "Regola: Aggiunge",
    ]);
    expect(row).toBe(
      "Fendente,Un colpo netto,Combattimento,3,true,4,false,true,true,false,Visibile,,,,"
    );
  });

  it("lascia vuota la colonna Max ripetizioni quando non impostata", () => {
    const csv = buildTalentsCsv([
      makeEntry({ flags: { cost: 1, repeatable: false } }),
    ]);
    const [, row] = csv.split("\r\n");
    expect(row.split(",")[5]).toBe("");
  });
});

describe("parseTalentsCsv", () => {
  const header =
    "Nome,Descrizione,Listato,Costo,Ripetibile,Max ripetizioni,Solo in creazione,Usabile come downtime,Bonus missiva,Bonus downtime,Visibilità,Richiede,Blocca";

  it("legge tutti i nuovi attributi da riga CSV", () => {
    const csv = `${header}\r\nFendente,Un colpo,Combattimento,3,true,4,false,true,true,false,Visibile,,`;
    const { rows, errors } = parseTalentsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        name: "Fendente",
        description: "Un colpo",
        category: "Combattimento",
        cost: 3,
        repeatable: true,
        maxRepetitions: 4,
        creationOnly: false,
        isDowntimeUsable: true,
        isMissivePointBonus: true,
        isDowntimePointBonus: false,
        visibility: DataVisibility.visible,
        requires: [],
        blocks: [],
      } satisfies ParsedTalentRow,
    ]);
  });

  it("tollera Max ripetizioni assente", () => {
    const csv = `${header}\r\nFendente,,,,,,,,,,,,`;
    const { rows, errors } = parseTalentsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0].maxRepetitions).toBeUndefined();
  });

  it("segnala e scarta Max ripetizioni non numerico", () => {
    const csv = `${header}\r\nFendente,,,,,abc,,,,,,,`;
    const { rows, errors } = parseTalentsCsv(csv);
    expect(errors).toEqual(["Riga 2: max ripetizioni non numerico, ignorato"]);
    expect(rows[0].maxRepetitions).toBeUndefined();
  });

  it("alza a 2 un Max ripetizioni sotto la soglia minima", () => {
    const csv = `${header}\r\nFendente,,,,,1,,,,,,,`;
    const { rows, errors } = parseTalentsCsv(csv);
    expect(errors).toEqual([
      "Riga 2: max ripetizioni deve essere almeno 2, impostato a 2",
    ]);
    expect(rows[0].maxRepetitions).toBe(2);
  });
});

describe("diffTalentsCsv", () => {
  it("rileva un cambio su un attributo booleano aggiunto di recente", () => {
    const existing = makeEntry({
      flags: {
        category: "Combattimento",
        cost: 3,
        repeatable: true,
        maxRepetitions: 4,
        creationOnly: false,
        isDowntimeUsable: false,
        isMissivePointBonus: false,
        isDowntimePointBonus: false,
      },
    });
    const row: ParsedTalentRow = {
      name: "Fendente",
      description: "Un colpo netto",
      category: "Combattimento",
      cost: 3,
      repeatable: true,
      maxRepetitions: 4,
      creationOnly: false,
      isDowntimeUsable: true,
      isMissivePointBonus: false,
      isDowntimePointBonus: false,
      visibility: DataVisibility.visible,
      requires: [],
      blocks: [],
    };

    const diff = diffTalentsCsv([row], [existing]);
    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toUpdate[0].changes).toEqual([
      { label: "Usabile come downtime", from: "No", to: "Sì" },
    ]);
  });

  it("non propone aggiornamenti per una riga identica alla voce esistente", () => {
    const existing = makeEntry();
    const row: ParsedTalentRow = {
      name: existing.name,
      description: existing.description ?? "",
      category: "Combattimento",
      cost: 3,
      repeatable: true,
      maxRepetitions: 4,
      creationOnly: false,
      isDowntimeUsable: true,
      isMissivePointBonus: true,
      isDowntimePointBonus: false,
      visibility: DataVisibility.visible,
      requires: [],
      blocks: [],
    };

    const diff = diffTalentsCsv([row], [existing]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toCreate).toEqual([]);
  });
});

describe("CSV: Visibile con / Aggiunge", () => {
  const catalog = [
    { id: 1, name: "Fendente" },
    { id: 20, name: "Umano" },
    { id: 21, name: "Vista elfica" },
  ];
  const baseRow = (
    overrides: Partial<ParsedTalentRow> = {}
  ): ParsedTalentRow => ({
    name: "Fendente",
    description: "Un colpo netto",
    category: "Combattimento",
    cost: 3,
    repeatable: true,
    maxRepetitions: 4,
    creationOnly: false,
    isDowntimeUsable: true,
    isMissivePointBonus: true,
    isDowntimePointBonus: false,
    visibility: DataVisibility.visible,
    requires: [],
    blocks: [],
    ...overrides,
  });

  it("esporta le colonne Visibile con (con gruppo OR) e Aggiunge", () => {
    const csv = buildTalentsCsv(
      [makeEntry()],
      [
        {
          id: 1,
          definitionId: 1,
          requiredDefinitionId: 20,
          type: "visibleWith",
          groupId: 2,
        },
        {
          id: 2,
          definitionId: 1,
          requiredDefinitionId: 21,
          type: "grants",
          groupId: null,
        },
      ],
      catalog
    );
    const [header, row] = csv.split("\r\n");
    expect(header.endsWith(",Regola: Visibile con,Regola: Aggiunge")).toBe(
      true
    );
    expect(row.endsWith(",Umano (gruppo 2),Vista elfica")).toBe(true);
  });

  it("legge le colonne e scarta il gruppo su Aggiunge", () => {
    const { rows, errors } = parseTalentsCsv(
      "Nome,Visibile con,Aggiunge\nFendente,Umano (gruppo 2),Vista elfica (gruppo 1)"
    );
    expect(errors).toEqual([]);
    expect(rows[0].visibleWith).toEqual([{ name: "Umano", groupId: 2 }]);
    expect(rows[0].grants).toEqual([{ name: "Vista elfica", groupId: null }]);
  });

  it("propone di aggiungere gli archi nuovi", () => {
    const diff = diffTalentsCsv(
      [
        baseRow({
          visibleWith: [{ name: "Umano", groupId: null }],
          grants: [{ name: "Vista elfica", groupId: null }],
        }),
      ],
      [makeEntry()],
      catalog,
      []
    );
    expect(diff.toUpdate[0].requirementChanges.toAdd.map(r => r.type)).toEqual([
      "visibleWith",
      "grants",
    ]);
  });

  it("colonne assenti dal CSV: gli archi esistenti di quel tipo restano intatti", () => {
    const diff = diffTalentsCsv([baseRow()], [makeEntry()], catalog, [
      {
        id: 1,
        definitionId: 1,
        requiredDefinitionId: 20,
        type: "visibleWith",
        groupId: null,
      },
      {
        id: 2,
        definitionId: 1,
        requiredDefinitionId: 21,
        type: "grants",
        groupId: null,
      },
    ]);
    expect(diff.toUpdate).toEqual([]);
  });

  it("colonna presente ma vuota: rimuove gli archi esistenti di quel tipo", () => {
    const diff = diffTalentsCsv(
      [baseRow({ grants: [] })],
      [makeEntry()],
      catalog,
      [
        {
          id: 2,
          definitionId: 1,
          requiredDefinitionId: 21,
          type: "grants",
          groupId: null,
        },
      ]
    );
    expect(diff.toUpdate[0].requirementChanges.toRemove).toEqual([
      { id: 2, requiredName: "Vista elfica", type: "grants", groupId: null },
    ]);
  });

  it("Richiede: legge il gruppo OR e scarta quello su Blocca", () => {
    const { rows } = parseTalentsCsv(
      "Nome,Regola: Richiede,Blocca\nFendente,Umano (gruppo 1); Vista elfica (gruppo 1),Umano (gruppo 3)"
    );
    expect(rows[0].requires).toEqual([
      { name: "Umano", groupId: 1 },
      { name: "Vista elfica", groupId: 1 },
    ]);
    expect(rows[0].blocks).toEqual([{ name: "Umano", groupId: null }]);
  });

  it("Richiede/Blocca assenti dal CSV: gli archi esistenti restano intatti", () => {
    const diff = diffTalentsCsv(
      [baseRow({ requires: undefined, blocks: undefined })],
      [makeEntry()],
      catalog,
      [
        {
          id: 3,
          definitionId: 1,
          requiredDefinitionId: 20,
          type: "requires",
          groupId: 1,
        },
        {
          id: 4,
          definitionId: 1,
          requiredDefinitionId: 21,
          type: "blocks",
          groupId: null,
        },
      ]
    );
    expect(diff.toUpdate).toEqual([]);
  });

  it("Richiede: un cambio di gruppo OR rimuove e ricrea l'arco", () => {
    const diff = diffTalentsCsv(
      [baseRow({ requires: [{ name: "Umano", groupId: 2 }] })],
      [makeEntry()],
      catalog,
      [
        {
          id: 5,
          definitionId: 1,
          requiredDefinitionId: 20,
          type: "requires",
          groupId: 1,
        },
      ]
    );
    expect(diff.toUpdate[0].requirementChanges).toEqual({
      toRemove: [
        { id: 5, requiredName: "Umano", type: "requires", groupId: 1 },
      ],
      toAdd: [
        {
          requiredDefinitionId: 20,
          requiredName: "Umano",
          type: "requires",
          groupId: 2,
        },
      ],
    });
  });
});

describe("diffTalentsCsv: riferimenti in avanti nello stesso CSV", () => {
  it("risolve 'Richiede' verso un talento creato da un'altra riga dello stesso import", () => {
    const rows: ParsedTalentRow[] = [
      {
        name: "Fendente",
        description: "",
        category: "",
        cost: 0,
        repeatable: false,
        maxRepetitions: undefined,
        creationOnly: false,
        isDowntimeUsable: false,
        isMissivePointBonus: false,
        isDowntimePointBonus: false,
        visibility: DataVisibility.visible,
        requires: [{ name: "Colpo base", groupId: null }],
        blocks: [],
      },
      {
        name: "Colpo base",
        description: "",
        category: "",
        cost: 0,
        repeatable: false,
        maxRepetitions: undefined,
        creationOnly: false,
        isDowntimeUsable: false,
        isMissivePointBonus: false,
        isDowntimePointBonus: false,
        visibility: DataVisibility.visible,
        requires: [],
        blocks: [],
      },
    ];

    const diff = diffTalentsCsv(rows, [], [], []);

    expect(diff.errors).toEqual([]);
    expect(diff.toCreate).toHaveLength(2);
    const fendente = diff.toCreate.find(c => c.row.name === "Fendente");
    expect(fendente?.requirementsToAdd).toEqual([
      {
        requiredDefinitionId: null,
        requiredName: "Colpo base",
        type: "requires",
        groupId: null,
      },
    ]);
  });
});

describe("parseTalentsCsv: delimitatore ;", () => {
  it("riconosce il punto e virgola dall'intestazione", () => {
    const csv = 'Nome;Descrizione;Costo;Richiede\r\nA;"x; y";10;\r\nB;z;5;A; C';
    const { rows, errors } = parseTalentsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows.map(r => [r.name, r.description, r.cost])).toEqual([
      ["A", "x; y", 10],
      ["B", "z", 5],
    ]);
  });
});
