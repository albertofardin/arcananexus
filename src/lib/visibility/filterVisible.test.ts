import { describe, it, expect } from "vitest";
import { DataVisibility } from "@prisma/client";
import {
  buildVisibilityConditions,
  filterVisible,
  isEntryVisible,
} from "./filterVisible";
import type {
  OwnedCharacterData,
  VisibilityConditionEdge,
  VisibilityContext,
  VisibilityGated,
  VisibilityViewer,
} from "./types";
import {
  mockCampaign,
  mockCharacter,
  mockCharacterData,
  mockDataType,
} from "@/test/helpers/prisma-fixtures";

// `CharacterData` posseduta dal viewer con la `DataType` già "inclusa", come
// arriverebbe da un `include: { dataType: true }` a monte (vedi
// `types.ts#OwnedCharacterData`).
function mockOwnedData(
  overrides: Partial<Parameters<typeof mockCharacterData>[0]> & {
    dataType: ReturnType<typeof mockDataType>;
  }
): OwnedCharacterData {
  const { dataType, ...characterDataOverrides } = overrides;
  return { ...mockCharacterData(characterDataOverrides), dataType };
}

// Voce minimale che soddisfa `VisibilityGated`, per test isolati dallo shape
// completo di `ReferenceData`/`CharacterData`.
function mockEntry(overrides?: Partial<VisibilityGated>): VisibilityGated {
  return {
    id: 1,
    visibility: DataVisibility.hidden,
    ...overrides,
  };
}

const player: VisibilityViewer = { userId: "user-1", isStaff: false };
const staff: VisibilityViewer = { userId: "master-1", isStaff: true };

function makeContext(
  overrides?: Partial<VisibilityContext>
): VisibilityContext {
  return {
    campaign: mockCampaign({ id: 1 }),
    character: mockCharacter({ id: 1, campaignId: 1 }),
    ownedData: [],
    ...overrides,
  };
}

// Costruisce la `visibilityConditions` map per la sola voce `entryId`.
function conditionsFor(
  entryId: number,
  edges: VisibilityConditionEdge[]
): Map<number, VisibilityConditionEdge[]> {
  return new Map([[entryId, edges]]);
}

describe("isEntryVisible / filterVisible", () => {
  describe("visibilità di base (nessun arco visibleWith)", () => {
    it("mostra a chiunque una voce `visible` senza condizione", () => {
      const entry = mockEntry({ visibility: DataVisibility.visible });
      expect(isEntryVisible(player, entry, makeContext())).toBe(true);
    });

    it("nasconde ai non-staff una voce `hidden` senza condizione", () => {
      const entry = mockEntry({ visibility: DataVisibility.hidden });
      expect(isEntryVisible(player, entry, makeContext())).toBe(false);
    });
  });

  describe("condizione AND (righe con groupId nullo)", () => {
    const raceDataType = mockDataType({ id: 10, campaignId: 1 });

    it("mostra la voce condizionata a chi possiede la voce bersaglio", () => {
      const entry = mockEntry({ visibility: DataVisibility.hidden });
      const context = makeContext({
        visibilityConditions: conditionsFor(1, [
          { requiredDefinitionId: 100, groupId: null },
        ]),
        ownedData: [
          mockOwnedData({
            dataTypeId: 10,
            dataType: raceDataType,
            referenceDataId: 100,
          }),
        ],
      });

      expect(isEntryVisible(player, entry, context)).toBe(true);
    });

    it("mostra sempre una voce già posseduta, anche con condizione non soddisfatta e PG non attivo", () => {
      const entry = mockEntry({ id: 1, visibility: DataVisibility.hidden });
      const context = makeContext({
        character: mockCharacter({ id: 1, campaignId: 1, approvalDate: null }),
        visibilityConditions: conditionsFor(1, [
          { requiredDefinitionId: 100, groupId: null },
        ]),
        ownedData: [
          mockOwnedData({
            dataTypeId: 10,
            dataType: raceDataType,
            referenceDataId: 1,
          }),
        ],
      });

      expect(isEntryVisible(player, entry, context)).toBe(true);
    });

    it("nasconde la voce condizionata a chi non possiede la voce bersaglio", () => {
      const entry = mockEntry({ visibility: DataVisibility.hidden });
      const context = makeContext({
        visibilityConditions: conditionsFor(1, [
          { requiredDefinitionId: 100, groupId: null },
        ]),
      });

      expect(isEntryVisible(player, entry, context)).toBe(false);
    });

    it("richiede TUTTE le righe individuali (AND) quando ce ne sono più di una", () => {
      const entry = mockEntry({ visibility: DataVisibility.hidden });
      const context = makeContext({
        visibilityConditions: conditionsFor(1, [
          { requiredDefinitionId: 100, groupId: null },
          { requiredDefinitionId: 200, groupId: null },
        ]),
        // Possiede solo una delle due voci richieste.
        ownedData: [
          mockOwnedData({
            dataTypeId: 10,
            dataType: raceDataType,
            referenceDataId: 100,
          }),
        ],
      });

      expect(isEntryVisible(player, entry, context)).toBe(false);
    });

    it("la condizione sostituisce la visibilità di base anche se `visible`", () => {
      // Anche una voce marcata `visible` resta gated dalla condizione se
      // presente: la condizione è sempre l'ultima parola per i non-staff.
      const entry = mockEntry({ visibility: DataVisibility.visible });
      const context = makeContext({
        visibilityConditions: conditionsFor(1, [
          { requiredDefinitionId: 100, groupId: null },
        ]),
      });

      expect(isEntryVisible(player, entry, context)).toBe(false);
    });
  });

  describe("condizione OR-group (righe con lo stesso groupId)", () => {
    const religionDataType = mockDataType({ id: 20, campaignId: 1 });

    it("mostra la voce se il PG possiede ALMENO UNA alternativa del gruppo", () => {
      const entry = mockEntry({ visibility: DataVisibility.hidden });
      const context = makeContext({
        visibilityConditions: conditionsFor(1, [
          { requiredDefinitionId: 100, groupId: 1 },
          { requiredDefinitionId: 200, groupId: 1 },
        ]),
        ownedData: [
          mockOwnedData({
            dataTypeId: 20,
            dataType: religionDataType,
            referenceDataId: 200,
          }),
        ],
      });

      expect(isEntryVisible(player, entry, context)).toBe(true);
    });

    it("nasconde la voce se il PG non possiede nessuna alternativa del gruppo", () => {
      const entry = mockEntry({ visibility: DataVisibility.hidden });
      const context = makeContext({
        visibilityConditions: conditionsFor(1, [
          { requiredDefinitionId: 100, groupId: 1 },
          { requiredDefinitionId: 200, groupId: 1 },
        ]),
      });

      expect(isEntryVisible(player, entry, context)).toBe(false);
    });
  });

  describe("PG non attivo", () => {
    const raceDataType = mockDataType({ id: 10, campaignId: 1 });

    function makeEntry() {
      return mockEntry({ visibility: DataVisibility.hidden });
    }

    it.each([
      ["deceduto", { deathDate: new Date("2024-06-01") }],
      ["in pausa", { parkDate: new Date("2024-06-01") }],
      ["in revisione", { approvalDate: null }],
    ])(
      "nasconde la voce condizionata anche se la condizione sarebbe soddisfatta, PG %s",
      (_label, characterOverrides) => {
        const context = makeContext({
          character: mockCharacter({
            id: 1,
            campaignId: 1,
            ...characterOverrides,
          }),
          visibilityConditions: conditionsFor(1, [
            { requiredDefinitionId: 100, groupId: null },
          ]),
          ownedData: [
            mockOwnedData({
              dataTypeId: 10,
              dataType: raceDataType,
              referenceDataId: 100,
            }),
          ],
        });

        expect(isEntryVisible(player, makeEntry(), context)).toBe(false);
      }
    );

    it("nasconde la voce condizionata se il viewer non ha alcun PG in questa campagna", () => {
      const context = makeContext({
        character: null,
        visibilityConditions: conditionsFor(1, [
          { requiredDefinitionId: 100, groupId: null },
        ]),
        ownedData: [
          mockOwnedData({
            dataTypeId: 10,
            dataType: raceDataType,
            referenceDataId: 100,
          }),
        ],
      });

      expect(isEntryVisible(player, makeEntry(), context)).toBe(false);
    });

    it("lo staff continua a vedere la voce condizionata anche con un PG non attivo", () => {
      const context = makeContext({
        character: mockCharacter({
          id: 1,
          campaignId: 1,
          deathDate: new Date("2024-06-01"),
        }),
        visibilityConditions: conditionsFor(1, [
          { requiredDefinitionId: 100, groupId: null },
        ]),
      });

      expect(isEntryVisible(staff, makeEntry(), context)).toBe(true);
    });
  });

  describe("bypass staff", () => {
    it("lo staff vede anche le voci hidden senza condizione", () => {
      const entry = mockEntry({ visibility: DataVisibility.hidden });
      expect(isEntryVisible(staff, entry, makeContext())).toBe(true);
    });

    it("lo staff vede anche le voci condizionate non soddisfatte", () => {
      const entry = mockEntry({ visibility: DataVisibility.hidden });
      const context = makeContext({
        visibilityConditions: conditionsFor(1, [
          { requiredDefinitionId: 100, groupId: null },
        ]),
      });
      expect(isEntryVisible(staff, entry, context)).toBe(true);
    });
  });

  describe("isolamento multi-tenant", () => {
    it("non conta `ownedData` di un'altra campagna per soddisfare la condizione", () => {
      const entry = mockEntry({ visibility: DataVisibility.hidden });
      // Il viewer possiede la voce bersaglio, ma nella campagna 2, mentre il
      // contesto di valutazione è la campagna 1.
      const otherCampaignDataType = mockDataType({ id: 99, campaignId: 2 });
      const context = makeContext({
        campaign: mockCampaign({ id: 1 }),
        visibilityConditions: conditionsFor(1, [
          { requiredDefinitionId: 100, groupId: null },
        ]),
        ownedData: [
          mockOwnedData({
            dataTypeId: 99,
            dataType: otherCampaignDataType,
            referenceDataId: 100,
          }),
        ],
      });

      expect(isEntryVisible(player, entry, context)).toBe(false);
    });
  });

  describe("filterVisible su array", () => {
    it("filtra un elenco misto tenendo solo le voci visibili al viewer", () => {
      const entries = [
        mockEntry({ id: 1, visibility: DataVisibility.visible }),
        mockEntry({ id: 2, visibility: DataVisibility.hidden }),
        mockEntry({ id: 3, visibility: DataVisibility.hidden }),
      ];
      const context = makeContext({
        visibilityConditions: conditionsFor(3, [
          { requiredDefinitionId: 100, groupId: null },
        ]),
      });

      const visibleForPlayer = filterVisible(entries, player, context);
      expect(visibleForPlayer).toEqual([entries[0]]);

      const visibleForStaff = filterVisible(entries, staff, context);
      expect(visibleForStaff).toEqual(entries);
    });
  });
});

describe("buildVisibilityConditions", () => {
  it("raggruppa per voce solo gli archi visibleWith, ignorando gli altri tipi", () => {
    const conditions = buildVisibilityConditions([
      {
        definitionId: 1,
        requiredDefinitionId: 20,
        type: "visibleWith",
        groupId: 2,
      },
      {
        definitionId: 1,
        requiredDefinitionId: 21,
        type: "visibleWith",
        groupId: null,
      },
      {
        definitionId: 1,
        requiredDefinitionId: 22,
        type: "requires",
        groupId: null,
      },
      {
        definitionId: 3,
        requiredDefinitionId: 23,
        type: "grants",
        groupId: null,
      },
    ]);
    expect(conditions.get(1)).toEqual([
      { requiredDefinitionId: 20, groupId: 2 },
      { requiredDefinitionId: 21, groupId: null },
    ]);
    expect(conditions.has(3)).toBe(false);
  });
});
