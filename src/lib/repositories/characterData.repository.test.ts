import { describe, it, expect, beforeEach, vi } from "vitest";
import { DataVisibility, Prisma } from "@prisma/client";
import {
  listCharacterDataForCharacter,
  countCharacterDataByCharacterAndReferenceData,
  createCharacterData,
  deleteCharacterDataByDataType,
  listOwnedCharacterDataInCampaign,
  countCharacterDataByReferenceData,
  countCharacterDataByDataType,
  listCharacterDataForCharacterWithDetails,
  getCharacterDataByIdScoped,
  updateCharacterData,
  deleteCharacterDataById,
} from "./characterData.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockCharacterData,
  mockDataType,
  mockReferenceData,
} from "@/test/helpers/prisma-fixtures";

describe("CharacterData Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listCharacterDataForCharacter", () => {
    it("should list all assignments for a character", async () => {
      const rows = [mockCharacterData({ characterId: 1 })];
      prismaMock.characterData.findMany.mockResolvedValue(rows);

      const result = await listCharacterDataForCharacter(prismaClient, 1);

      expect(result).toEqual(rows);
      expect(prismaMock.characterData.findMany).toHaveBeenCalledWith({
        where: { characterId: 1 },
        orderBy: { id: "asc" },
      });
    });
  });

  describe("countCharacterDataByCharacterAndReferenceData", () => {
    it("counts the existing assignments of the same definition for this character", async () => {
      prismaMock.characterData.count.mockResolvedValue(2);

      const result = await countCharacterDataByCharacterAndReferenceData(
        prismaClient,
        1,
        5
      );

      expect(result).toBe(2);
      expect(prismaMock.characterData.count).toHaveBeenCalledWith({
        where: { characterId: 1, referenceDataId: 5 },
      });
    });

    it("returns 0 when the character does not have that definition yet", async () => {
      prismaMock.characterData.count.mockResolvedValue(0);

      const result = await countCharacterDataByCharacterAndReferenceData(
        prismaClient,
        1,
        5
      );

      expect(result).toBe(0);
    });
  });

  describe("createCharacterData", () => {
    it("should create an assignment with the given fields, defaulting the optional ones", async () => {
      const input = {
        characterId: 1,
        referenceDataId: 5,
        dataTypeId: 2,
      };
      const created = mockCharacterData(input);
      prismaMock.characterData.create.mockResolvedValue(created);

      const result = await createCharacterData(prismaClient, input);

      expect(result).toEqual(created);
      expect(prismaMock.characterData.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          referenceDataId: 5,
          dataTypeId: 2,
          value: undefined,
          grantedById: null,
          grantedByOverride: false,
          actionId: null,
        },
      });
    });

    it("should persist the master override fields when provided", async () => {
      const input = {
        characterId: 1,
        referenceDataId: 5,
        dataTypeId: 2,
        grantedById: "master-1",
        grantedByOverride: true,
        actionId: 9,
        value: { choice: "fuoco" },
      };
      const created = mockCharacterData(input);
      prismaMock.characterData.create.mockResolvedValue(created);

      await createCharacterData(prismaClient, input);

      expect(prismaMock.characterData.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          referenceDataId: 5,
          dataTypeId: 2,
          value: { choice: "fuoco" },
          grantedById: "master-1",
          grantedByOverride: true,
          actionId: 9,
        },
      });
    });

    it("should map an explicit null value to Prisma.JsonNull", async () => {
      const input = {
        characterId: 1,
        referenceDataId: 5,
        dataTypeId: 2,
        value: null,
      };
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData(input)
      );

      await createCharacterData(prismaClient, input);

      expect(prismaMock.characterData.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ value: Prisma.JsonNull }),
        })
      );
    });

    // T-038: il repository si limita a passare `visibility` così com'è (la
    // decisione sul valore di default spetta al servizio di assegnazione,
    // vedi `characterData.service.ts`); quando il chiamante non la passa,
    // resta `undefined` e lo schema applica il proprio `@default(hidden)`.
    it("passes visibility through to the create call when provided", async () => {
      const input = {
        characterId: 1,
        referenceDataId: 5,
        dataTypeId: 2,
        visibility: DataVisibility.visible,
      };
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData(input)
      );

      await createCharacterData(prismaClient, input);

      expect(prismaMock.characterData.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            visibility: DataVisibility.visible,
          }),
        })
      );
    });
  });

  describe("deleteCharacterDataByDataType", () => {
    it("should delete every assignment of a character for a given dataType", async () => {
      prismaMock.characterData.deleteMany.mockResolvedValue({ count: 1 });

      const result = await deleteCharacterDataByDataType(prismaClient, 1, 2);

      expect(result).toEqual({ count: 1 });
      expect(prismaMock.characterData.deleteMany).toHaveBeenCalledWith({
        where: { characterId: 1, dataTypeId: 2 },
      });
    });
  });

  describe("listOwnedCharacterDataInCampaign", () => {
    it("scopes to the campaign and matches by userId when no characterId is given", async () => {
      const owned = [
        {
          ...mockCharacterData({ userId: "user-1" }),
          dataType: mockDataType(),
        },
      ];
      prismaMock.characterData.findMany.mockResolvedValue(owned);

      const result = await listOwnedCharacterDataInCampaign(prismaClient, 1, {
        userId: "user-1",
      });

      expect(result).toEqual(owned);
      expect(prismaMock.characterData.findMany).toHaveBeenCalledWith({
        where: {
          dataType: { campaignId: 1 },
          OR: [{ userId: "user-1" }],
        },
        include: { dataType: true },
      });
    });

    it("also matches by characterId when the viewer has a character in the campaign", async () => {
      prismaMock.characterData.findMany.mockResolvedValue([]);

      await listOwnedCharacterDataInCampaign(prismaClient, 1, {
        userId: "user-1",
        characterId: 42,
      });

      expect(prismaMock.characterData.findMany).toHaveBeenCalledWith({
        where: {
          dataType: { campaignId: 1 },
          OR: [{ userId: "user-1" }, { characterId: 42 }],
        },
        include: { dataType: true },
      });
    });

    it("does not leak CharacterData from another campaign (multi-tenant isolation)", async () => {
      prismaMock.characterData.findMany.mockResolvedValue([]);

      await listOwnedCharacterDataInCampaign(prismaClient, 2, {
        userId: "user-1",
      });

      expect(prismaMock.characterData.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ dataType: { campaignId: 2 } }),
        })
      );
    });
  });

  describe("countCharacterDataByReferenceData", () => {
    it("returns the number of assignments of a reference data entry", async () => {
      prismaMock.characterData.count.mockResolvedValue(2);

      const result = await countCharacterDataByReferenceData(prismaClient, 5);

      expect(result).toBe(2);
      expect(prismaMock.characterData.count).toHaveBeenCalledWith({
        where: { referenceDataId: 5 },
      });
    });

    it("returns 0 when the entry has no assignments", async () => {
      prismaMock.characterData.count.mockResolvedValue(0);

      const result = await countCharacterDataByReferenceData(prismaClient, 5);

      expect(result).toBe(0);
    });
  });

  describe("countCharacterDataByDataType", () => {
    it("returns the number of assignments across every entry of the data type via the authoritative referenceData relation", async () => {
      prismaMock.characterData.count.mockResolvedValue(3);

      const result = await countCharacterDataByDataType(prismaClient, 7);

      expect(result).toBe(3);
      // Round 2 (T-036): il filtro passa dalla relazione `referenceData`,
      // non dal campo denormalizzato `dataTypeId` su `CharacterData` — resta
      // corretto anche se quel campo divergesse dalla `ReferenceData` reale
      // della riga (import legacy/seed manuale), perché `referenceDataId` è
      // obbligatorio a schema e ogni riga passa sempre per il join.
      expect(prismaMock.characterData.count).toHaveBeenCalledWith({
        where: { referenceData: { dataTypeId: 7 } },
      });
    });

    it("does not filter on the denormalized dataTypeId column directly", async () => {
      prismaMock.characterData.count.mockResolvedValue(1);

      await countCharacterDataByDataType(prismaClient, 7);

      const [{ where }] = prismaMock.characterData.count.mock.calls[0];
      expect(where).not.toHaveProperty("dataTypeId");
    });

    it("returns 0 when no entry of the data type has assignments", async () => {
      prismaMock.characterData.count.mockResolvedValue(0);

      const result = await countCharacterDataByDataType(prismaClient, 7);

      expect(result).toBe(0);
    });
  });

  describe("listCharacterDataForCharacterWithDetails", () => {
    it("lists a character's assignments with dataType/referenceData included", async () => {
      const rows = [
        {
          ...mockCharacterData({ characterId: 1 }),
          dataType: mockDataType(),
          referenceData: mockReferenceData(),
        },
      ];
      prismaMock.characterData.findMany.mockResolvedValue(rows);

      const result = await listCharacterDataForCharacterWithDetails(
        prismaClient,
        1
      );

      expect(result).toEqual(rows);
      expect(prismaMock.characterData.findMany).toHaveBeenCalledWith({
        where: { characterId: 1 },
        orderBy: { id: "asc" },
        include: {
          dataType: true,
          referenceData: true,
        },
      });
    });
  });

  describe("getCharacterDataByIdScoped", () => {
    it("resolves a CharacterData scoped to both the character and the campaign", async () => {
      const found = mockCharacterData({ id: 5, characterId: 1 });
      prismaMock.characterData.findFirst.mockResolvedValue(found);

      const result = await getCharacterDataByIdScoped(prismaClient, 5, 1, 3);

      expect(result).toEqual(found);
      expect(prismaMock.characterData.findFirst).toHaveBeenCalledWith({
        where: { id: 5, characterId: 1, dataType: { campaignId: 3 } },
        include: { dataType: true, referenceData: true },
      });
    });

    it("returns null when the id belongs to another character or another campaign", async () => {
      prismaMock.characterData.findFirst.mockResolvedValue(null);

      const result = await getCharacterDataByIdScoped(prismaClient, 5, 1, 3);

      expect(result).toBeNull();
    });
  });

  describe("updateCharacterData", () => {
    it("updates only the visibility of the given CharacterData", async () => {
      const updated = mockCharacterData({
        id: 5,
        visibility: DataVisibility.visible,
      });
      prismaMock.characterData.update.mockResolvedValue(updated);

      const result = await updateCharacterData(prismaClient, 5, {
        visibility: DataVisibility.visible,
      });

      expect(result).toEqual(updated);
      expect(prismaMock.characterData.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { visibility: DataVisibility.visible },
      });
    });
  });

  describe("deleteCharacterDataById", () => {
    it("deletes the CharacterData with the given id", async () => {
      const deleted = mockCharacterData({ id: 5 });
      prismaMock.characterData.delete.mockResolvedValue(deleted);

      const result = await deleteCharacterDataById(prismaClient, 5);

      expect(result).toEqual(deleted);
      expect(prismaMock.characterData.delete).toHaveBeenCalledWith({
        where: { id: 5 },
      });
    });
  });
});
