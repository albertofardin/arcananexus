import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DataTypeKind,
  DataTypeAssignability,
  DataVisibility,
} from "@prisma/client";
import { getCharacterAcquirableTalents } from "./characterTalents.service";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockDataType,
  mockReferenceData,
  mockCampaign,
  mockCharacter,
} from "@/test/helpers/prisma-fixtures";

const baseParams = {
  characterId: 1,
  campaignId: 1,
  userId: "user-1",
};

// `referenceData.findMany` serve sia al catalogo talenti
// (`listReferenceDataForCampaign`, filtrato per `dataTypeId`) sia alla
// risoluzione nomi (`getReferenceDataNamesByIds`, filtrato per `id`): un
// `mockImplementation` che ispeziona il `where` ricevuto è più robusto di
// una catena `mockResolvedValueOnce` ordinata per call-order, perché
// `getReferenceDataNamesByIds` a volte va in early-return (nessun id
// mancante) e NON consuma la chiamata — una catena posizionale
// disallineerebbe silenziosamente i test successivi.
function mockReferenceDataFindMany(options: {
  catalog: unknown[];
  names?: { id: number; name: string }[];
}) {
  prismaMock.referenceData.findMany.mockImplementation(args => {
    const where = (args as { where?: Record<string, unknown> })?.where ?? {};
    if ("id" in where) {
      return Promise.resolve(options.names ?? []) as never;
    }
    return Promise.resolve(options.catalog) as never;
  });
}

describe("characterTalents.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.campaign.findFirst.mockResolvedValue(mockCampaign({ id: 1 }));
    prismaMock.character.findUnique.mockResolvedValue(
      mockCharacter({ id: 1, campaignId: 1 })
    );
    prismaMock.characterTalentUnlock.findMany.mockResolvedValue([]);
  });

  describe("getCharacterAcquirableTalents", () => {
    it("only queries ReferenceData scoped to talent-kind DataType, not the full campaign catalog", async () => {
      prismaMock.characterData.findMany.mockResolvedValue([]);
      prismaMock.dataType.findMany.mockResolvedValue([
        mockDataType({
          id: 10,
          kind: DataTypeKind.talent,
          assignability: DataTypeAssignability.always,
        }),
        mockDataType({ id: 20, kind: DataTypeKind.generic }),
      ]);
      mockReferenceDataFindMany({
        catalog: [
          mockReferenceData({ id: 1, dataTypeId: 10, name: "Talento A" }),
        ],
      });
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);

      const result = await getCharacterAcquirableTalents(prismaClient, {
        ...baseParams,
        isMaster: false,
      });

      expect(result.acquirableTalents).toEqual([
        expect.objectContaining({ id: 1, name: "Talento A" }),
      ]);
      // Il catalogo talenti deve essere scopato al solo `DataType` di kind
      // talent (10), mai a tutta la campagna (incluso il `DataType` generico
      // 20): è esattamente il costo che T-0xx doveva eliminare.
      expect(prismaMock.referenceData.findMany).toHaveBeenCalledWith({
        where: { dataType: { campaignId: 1 }, dataTypeId: { in: [10] } },
        orderBy: [{ dataTypeId: "asc" }, { order: "desc" }],
      });
    });

    it("excludes an already-owned, non-repeatable talent from acquirableTalents", async () => {
      prismaMock.characterData.findMany.mockResolvedValue([
        {
          id: 1,
          characterId: 1,
          dataType: mockDataType({ id: 10, kind: DataTypeKind.talent }),
          referenceData: mockReferenceData({ id: 1, dataTypeId: 10 }),
        },
      ] as never);
      prismaMock.dataType.findMany.mockResolvedValue([
        mockDataType({
          id: 10,
          kind: DataTypeKind.talent,
          assignability: DataTypeAssignability.always,
        }),
      ]);
      mockReferenceDataFindMany({
        catalog: [mockReferenceData({ id: 1, dataTypeId: 10, flags: null })],
      });
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);

      const result = await getCharacterAcquirableTalents(prismaClient, {
        ...baseParams,
        isMaster: false,
      });

      expect(result.acquirableTalents).toEqual([]);
    });

    it("excludes a repeatable talent once the character has reached flags.maxRepetitions", async () => {
      prismaMock.characterData.findMany.mockResolvedValue([
        {
          id: 1,
          characterId: 1,
          dataType: mockDataType({ id: 10, kind: DataTypeKind.talent }),
          referenceData: mockReferenceData({ id: 1, dataTypeId: 10 }),
        },
        {
          id: 2,
          characterId: 1,
          dataType: mockDataType({ id: 10, kind: DataTypeKind.talent }),
          referenceData: mockReferenceData({ id: 1, dataTypeId: 10 }),
        },
      ] as never);
      prismaMock.dataType.findMany.mockResolvedValue([
        mockDataType({
          id: 10,
          kind: DataTypeKind.talent,
          assignability: DataTypeAssignability.always,
        }),
      ]);
      mockReferenceDataFindMany({
        catalog: [
          mockReferenceData({
            id: 1,
            dataTypeId: 10,
            flags: { repeatable: true, maxRepetitions: 2 },
          }),
        ],
      });
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);

      const result = await getCharacterAcquirableTalents(prismaClient, {
        ...baseParams,
        isMaster: false,
      });

      expect(result.acquirableTalents).toEqual([]);
    });

    it("keeps a repeatable talent acquirable while below flags.maxRepetitions", async () => {
      prismaMock.characterData.findMany.mockResolvedValue([
        {
          id: 1,
          characterId: 1,
          dataType: mockDataType({ id: 10, kind: DataTypeKind.talent }),
          referenceData: mockReferenceData({ id: 1, dataTypeId: 10 }),
        },
      ] as never);
      prismaMock.dataType.findMany.mockResolvedValue([
        mockDataType({
          id: 10,
          kind: DataTypeKind.talent,
          assignability: DataTypeAssignability.always,
        }),
      ]);
      mockReferenceDataFindMany({
        catalog: [
          mockReferenceData({
            id: 1,
            dataTypeId: 10,
            flags: { repeatable: true, maxRepetitions: 2 },
          }),
        ],
      });
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);

      const result = await getCharacterAcquirableTalents(prismaClient, {
        ...baseParams,
        isMaster: false,
      });

      expect(result.acquirableTalents).toEqual([
        expect.objectContaining({ id: 1 }),
      ]);
    });

    it("resolves requiredDefinitionName for a requirement pointing outside the talent set (e.g. an origin)", async () => {
      prismaMock.characterData.findMany.mockResolvedValue([]);
      prismaMock.dataType.findMany.mockResolvedValue([
        mockDataType({
          id: 10,
          kind: DataTypeKind.talent,
          assignability: DataTypeAssignability.always,
        }),
      ]);
      mockReferenceDataFindMany({
        catalog: [
          mockReferenceData({ id: 1, dataTypeId: 10, name: "Talento A" }),
        ],
        names: [{ id: 99, name: "Origine X" }],
      });
      prismaMock.dataRequirement.findMany.mockResolvedValue([
        {
          id: 1,
          definitionId: 1,
          requiredDefinitionId: 99,
          type: "requires",
          groupId: null,
        },
        // Arco non relativo a un talento (definitionId 5 non è nel catalogo
        // talenti sopra): non deve comparire nel risultato.
        {
          id: 2,
          definitionId: 5,
          requiredDefinitionId: 6,
          type: "requires",
          groupId: null,
        },
      ]);

      const result = await getCharacterAcquirableTalents(prismaClient, {
        ...baseParams,
        isMaster: false,
      });

      expect(result.talentRequirements).toEqual([
        {
          definitionId: 1,
          requiredDefinitionId: 99,
          requiredDefinitionName: "Origine X",
          type: "requires",
          groupId: null,
        },
      ]);
      expect(prismaMock.referenceData.findMany).toHaveBeenCalledWith({
        where: { id: { in: [99] } },
        select: { id: true, name: true },
      });
    });

    it("shows master-only talents when isMaster is true, hides them otherwise", async () => {
      prismaMock.characterData.findMany.mockResolvedValue([]);
      prismaMock.dataType.findMany.mockResolvedValue([
        mockDataType({
          id: 10,
          kind: DataTypeKind.talent,
          assignability: DataTypeAssignability.masterOnly,
        }),
      ]);
      mockReferenceDataFindMany({
        catalog: [mockReferenceData({ id: 1, dataTypeId: 10 })],
      });
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);

      const asPlayer = await getCharacterAcquirableTalents(prismaClient, {
        ...baseParams,
        isMaster: false,
      });
      expect(asPlayer.acquirableTalents).toEqual([]);

      const asMaster = await getCharacterAcquirableTalents(prismaClient, {
        ...baseParams,
        isMaster: true,
      });
      expect(asMaster.acquirableTalents).toHaveLength(1);
    });

    it("hides a hidden talent from a player but shows it to staff", async () => {
      prismaMock.characterData.findMany.mockResolvedValue([]);
      prismaMock.dataType.findMany.mockResolvedValue([
        mockDataType({
          id: 10,
          kind: DataTypeKind.talent,
          assignability: DataTypeAssignability.always,
        }),
      ]);
      mockReferenceDataFindMany({
        catalog: [
          mockReferenceData({
            id: 1,
            dataTypeId: 10,
            name: "Talento Segreto",
            visibility: DataVisibility.hidden,
          }),
        ],
      });
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);

      const asPlayer = await getCharacterAcquirableTalents(prismaClient, {
        ...baseParams,
        isMaster: false,
      });
      expect(asPlayer.acquirableTalents).toEqual([]);

      const asMaster = await getCharacterAcquirableTalents(prismaClient, {
        ...baseParams,
        isMaster: true,
      });
      expect(asMaster.acquirableTalents).toHaveLength(1);
    });

    it("shows a hidden talent to a player when unlocked for their character (occhio master), and reports it in unlockedReferenceDataIds", async () => {
      prismaMock.characterData.findMany.mockResolvedValue([]);
      prismaMock.dataType.findMany.mockResolvedValue([
        mockDataType({
          id: 10,
          kind: DataTypeKind.talent,
          assignability: DataTypeAssignability.always,
        }),
      ]);
      mockReferenceDataFindMany({
        catalog: [
          mockReferenceData({
            id: 1,
            dataTypeId: 10,
            name: "Classe Segreta",
            visibility: DataVisibility.hidden,
          }),
        ],
      });
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);
      prismaMock.characterTalentUnlock.findMany.mockResolvedValue([
        { referenceDataId: 1 },
      ] as never);

      const result = await getCharacterAcquirableTalents(prismaClient, {
        ...baseParams,
        isMaster: false,
      });

      expect(result.acquirableTalents).toEqual([
        expect.objectContaining({ id: 1, name: "Classe Segreta" }),
      ]);
      expect(result.unlockedReferenceDataIds).toEqual([1]);
    });
  });
});
