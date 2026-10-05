import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  getReferenceDataById,
  getReferenceDataByIdScoped,
  listReferenceDataForCampaign,
  listReferenceDataForCampaignWithVisibility,
  listReferenceDataForDataType,
  listReferenceDataIdsForDataType,
  countReferenceDataByDataType,
  getReferenceDataByName,
  getReferenceDataByExternalId,
  getReferenceDataNamesByIds,
  listTalentCatalogForCampaign,
  createReferenceData,
  updateReferenceData,
  reorderReferenceData,
  deleteReferenceData,
} from "./referenceData.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockReferenceData,
  mockDataType,
} from "@/test/helpers/prisma-fixtures";

describe("ReferenceData Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getReferenceDataById", () => {
    it("should return referenceData with its dataType by default", async () => {
      const referenceData = {
        ...mockReferenceData(),
        dataType: mockDataType(),
      };
      prismaMock.referenceData.findUnique.mockResolvedValue(referenceData);

      const result = await getReferenceDataById(prismaClient, 1);

      expect(result).toEqual(referenceData);
      expect(prismaMock.referenceData.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: { dataType: true },
      });
    });

    it("should return null when not found", async () => {
      prismaMock.referenceData.findUnique.mockResolvedValue(null);

      const result = await getReferenceDataById(prismaClient, 999);

      expect(result).toBeNull();
    });

    it("should include the requirement graph when requested", async () => {
      const referenceData = {
        ...mockReferenceData(),
        dataType: mockDataType(),
        requirements: [],
        requiredBy: [],
      };
      prismaMock.referenceData.findUnique.mockResolvedValue(referenceData);

      await getReferenceDataById(prismaClient, 1, true);

      expect(prismaMock.referenceData.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          dataType: true,
          requirements: { include: { requiredDefinition: true } },
          requiredBy: { include: { definition: true } },
        },
      });
    });
  });

  describe("getReferenceDataByIdScoped", () => {
    it("should return referenceData when its dataType belongs to the campaign", async () => {
      const referenceData = {
        ...mockReferenceData(),
        dataType: mockDataType({ campaignId: 1 }),
      };
      prismaMock.referenceData.findUnique.mockResolvedValue(referenceData);

      const result = await getReferenceDataByIdScoped(prismaClient, 1, 1);

      expect(result).toEqual(referenceData);
      expect(prismaMock.referenceData.findUnique).toHaveBeenCalledWith({
        where: { id: 1, dataType: { campaignId: 1 } },
        include: { dataType: true },
      });
    });

    it("should return null when the referenceData belongs to another campaign (multi-tenant isolation)", async () => {
      prismaMock.referenceData.findUnique.mockResolvedValue(null);

      const result = await getReferenceDataByIdScoped(prismaClient, 1, 2);

      expect(result).toBeNull();
      expect(prismaMock.referenceData.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1, dataType: { campaignId: 2 } },
        })
      );
    });
  });

  describe("listReferenceDataForCampaign", () => {
    it("should scope results to the campaign via dataType", async () => {
      prismaMock.referenceData.findMany.mockResolvedValue([]);

      await listReferenceDataForCampaign(prismaClient, 1);

      expect(prismaMock.referenceData.findMany).toHaveBeenCalledWith({
        where: { dataType: { campaignId: 1 } },
        orderBy: [{ dataTypeId: "asc" }, { order: "desc" }],
        include: { dataType: true },
      });
    });

    it("should additionally filter by dataTypeId when provided", async () => {
      prismaMock.referenceData.findMany.mockResolvedValue([]);

      await listReferenceDataForCampaign(prismaClient, 1, 5);

      expect(prismaMock.referenceData.findMany).toHaveBeenCalledWith({
        where: { dataType: { campaignId: 1 }, dataTypeId: 5 },
        orderBy: [{ dataTypeId: "asc" }, { order: "desc" }],
        include: { dataType: true },
      });
    });

    it("should filter by multiple dataTypeId when an array is provided", async () => {
      prismaMock.referenceData.findMany.mockResolvedValue([]);

      await listReferenceDataForCampaign(prismaClient, 1, [5, 6]);

      expect(prismaMock.referenceData.findMany).toHaveBeenCalledWith({
        where: { dataType: { campaignId: 1 }, dataTypeId: { in: [5, 6] } },
        orderBy: [{ dataTypeId: "asc" }, { order: "desc" }],
        include: { dataType: true },
      });
    });
  });

  describe("getReferenceDataNamesByIds", () => {
    it("should look up id/name for the given ids", async () => {
      prismaMock.referenceData.findMany.mockResolvedValue([
        { id: 1, name: "Elfo" },
      ] as never);

      const result = await getReferenceDataNamesByIds(prismaClient, [1, 2]);

      expect(result).toEqual([{ id: 1, name: "Elfo" }]);
      expect(prismaMock.referenceData.findMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } },
        select: { id: true, name: true },
      });
    });

    it("should return an empty array without querying when ids is empty", async () => {
      const result = await getReferenceDataNamesByIds(prismaClient, []);

      expect(result).toEqual([]);
      expect(prismaMock.referenceData.findMany).not.toHaveBeenCalled();
    });
  });

  describe("listTalentCatalogForCampaign", () => {
    it("should scope to the campaign's talent-kind data types", async () => {
      prismaMock.referenceData.findMany.mockResolvedValue([
        { id: 1, name: "Guida" },
        { id: 2, name: "Combattimento" },
      ] as never);

      const result = await listTalentCatalogForCampaign(prismaClient, 1);

      expect(result.map(row => row.name)).toEqual(["Guida", "Combattimento"]);
      expect(prismaMock.referenceData.findMany).toHaveBeenCalledWith({
        where: { dataType: { campaignId: 1, kind: "talent" } },
        select: {
          id: true,
          name: true,
          description: true,
          visibility: true,
          flags: true,
        },
        orderBy: { name: "asc" },
      });
    });
  });

  describe("listReferenceDataForCampaignWithVisibility", () => {
    it("should scope results to the campaign via dataType", async () => {
      prismaMock.referenceData.findMany.mockResolvedValue([]);

      await listReferenceDataForCampaignWithVisibility(prismaClient, 1);

      expect(prismaMock.referenceData.findMany).toHaveBeenCalledWith({
        where: { dataType: { campaignId: 1 } },
        orderBy: [{ dataTypeId: "asc" }, { order: "desc" }],
      });
    });

    it("should return the entries as-is", async () => {
      const entry = mockReferenceData();
      prismaMock.referenceData.findMany.mockResolvedValue([entry]);

      const result = await listReferenceDataForCampaignWithVisibility(
        prismaClient,
        1
      );

      expect(result).toEqual([entry]);
    });
  });

  describe("listReferenceDataForDataType", () => {
    it("should scope results to the dataType", async () => {
      prismaMock.referenceData.findMany.mockResolvedValue([]);

      await listReferenceDataForDataType(prismaClient, 5);

      expect(prismaMock.referenceData.findMany).toHaveBeenCalledWith({
        where: { dataTypeId: 5 },
        orderBy: { order: "desc" },
      });
    });

    it("should return the entries as-is", async () => {
      const entry = mockReferenceData();
      prismaMock.referenceData.findMany.mockResolvedValue([entry]);

      const result = await listReferenceDataForDataType(prismaClient, 1);

      expect(result).toEqual([entry]);
    });
  });

  describe("listReferenceDataIdsForDataType", () => {
    it("should select only ids for the dataType", async () => {
      prismaMock.referenceData.findMany.mockResolvedValue([
        { id: 3 },
        { id: 1 },
      ] as never);

      const result = await listReferenceDataIdsForDataType(prismaClient, 5);

      expect(result).toEqual([3, 1]);
      expect(prismaMock.referenceData.findMany).toHaveBeenCalledWith({
        where: { dataTypeId: 5 },
        select: { id: true },
      });
    });
  });

  describe("countReferenceDataByDataType", () => {
    it("should count reference data scoped to the given dataType", async () => {
      prismaMock.referenceData.count.mockResolvedValue(3);

      const result = await countReferenceDataByDataType(prismaClient, 5);

      expect(result).toBe(3);
      expect(prismaMock.referenceData.count).toHaveBeenCalledWith({
        where: { dataTypeId: 5 },
      });
    });

    it("should return 0 when the dataType has no reference data", async () => {
      prismaMock.referenceData.count.mockResolvedValue(0);

      const result = await countReferenceDataByDataType(prismaClient, 5);

      expect(result).toBe(0);
    });
  });

  describe("getReferenceDataByName", () => {
    it("should find a reference data entry by name within a dataType (case-insensitive)", async () => {
      const referenceData = mockReferenceData({ name: "Elfo" });
      prismaMock.referenceData.findFirst.mockResolvedValue(referenceData);

      const result = await getReferenceDataByName(prismaClient, 1, "elfo");

      expect(result).toEqual(referenceData);
      expect(prismaMock.referenceData.findFirst).toHaveBeenCalledWith({
        where: {
          dataTypeId: 1,
          name: { equals: "elfo", mode: "insensitive" },
        },
      });
    });

    it("should prevent cross-dataType name collision", async () => {
      prismaMock.referenceData.findFirst.mockResolvedValue(null);

      const result = await getReferenceDataByName(prismaClient, 2, "Elfo");

      expect(result).toBeNull();
      expect(prismaMock.referenceData.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ dataTypeId: 2 }),
        })
      );
    });
  });

  describe("getReferenceDataByExternalId", () => {
    it("should find a reference data entry by externalId within a dataType (T-040)", async () => {
      const referenceData = mockReferenceData({ externalId: "nf-oggetto-1" });
      prismaMock.referenceData.findFirst.mockResolvedValue(referenceData);

      const result = await getReferenceDataByExternalId(
        prismaClient,
        1,
        "nf-oggetto-1"
      );

      expect(result).toEqual(referenceData);
      expect(prismaMock.referenceData.findFirst).toHaveBeenCalledWith({
        where: { dataTypeId: 1, externalId: "nf-oggetto-1" },
      });
    });

    it("should prevent cross-dataType externalId collision", async () => {
      prismaMock.referenceData.findFirst.mockResolvedValue(null);

      const result = await getReferenceDataByExternalId(
        prismaClient,
        2,
        "nf-oggetto-1"
      );

      expect(result).toBeNull();
      expect(prismaMock.referenceData.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ dataTypeId: 2 }),
        })
      );
    });
  });

  describe("createReferenceData", () => {
    it("should create referenceData with the provided flags, appending order after the current max", async () => {
      const input = {
        dataTypeId: 1,
        name: "Elfo",
        flags: { startingPx: 10 },
      };
      const created = {
        ...mockReferenceData(input),
        dataType: mockDataType(),
      };
      prismaMock.referenceData.aggregate.mockResolvedValue({
        _max: { order: 2 },
      } as Awaited<ReturnType<typeof prismaMock.referenceData.aggregate>>);
      prismaMock.referenceData.create.mockResolvedValue(created);

      const result = await createReferenceData(prismaClient, input);

      expect(result).toEqual(created);
      expect(prismaMock.referenceData.aggregate).toHaveBeenCalledWith({
        where: { dataTypeId: 1 },
        _max: { order: true },
      });
      expect(prismaMock.referenceData.create).toHaveBeenCalledWith({
        data: {
          dataTypeId: 1,
          name: "Elfo",
          description: undefined,
          flags: { startingPx: 10 },
          visibility: undefined,
          fileUrl: undefined,
          fileKey: undefined,
          externalId: undefined,
          order: 3,
        },
        include: { dataType: true },
      });
    });

    it("should assign order 0 for the first entry of a dataType", async () => {
      const input = { dataTypeId: 1, name: "Generica", flags: null };
      const created = {
        ...mockReferenceData(input),
        dataType: mockDataType(),
      };
      prismaMock.referenceData.aggregate.mockResolvedValue({
        _max: { order: null },
      } as Awaited<ReturnType<typeof prismaMock.referenceData.aggregate>>);
      prismaMock.referenceData.create.mockResolvedValue(created);

      await createReferenceData(prismaClient, input);

      expect(prismaMock.referenceData.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ flags: Prisma.JsonNull, order: 0 }),
        })
      );
    });
  });

  describe("updateReferenceData", () => {
    it("should update the provided fields", async () => {
      const updates = { name: "Elfo Silvano" };
      const updated = {
        ...mockReferenceData(updates),
        dataType: mockDataType(),
      };
      prismaMock.referenceData.update.mockResolvedValue(updated);

      const result = await updateReferenceData(prismaClient, 1, updates);

      expect(result).toEqual(updated);
      expect(prismaMock.referenceData.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          name: "Elfo Silvano",
          description: undefined,
          flags: undefined,
          visibility: undefined,
          fileUrl: undefined,
          fileKey: undefined,
          externalId: undefined,
        },
        include: { dataType: true },
      });
    });

    it("should persist fileUrl and fileKey when updating a document entry", async () => {
      const updates = {
        fileUrl: "https://utfs.io/f/abc123_regolamento.pdf",
        fileKey: "abc123",
      };
      const updated = {
        ...mockReferenceData(updates),
        dataType: mockDataType(),
      };
      prismaMock.referenceData.update.mockResolvedValue(updated);

      await updateReferenceData(prismaClient, 1, updates);

      expect(prismaMock.referenceData.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fileUrl: "https://utfs.io/f/abc123_regolamento.pdf",
            fileKey: "abc123",
          }),
        })
      );
    });
  });

  describe("reorderReferenceData", () => {
    it("gives the first id (top of the list) the highest order and the last id (bottom) the lowest", async () => {
      await reorderReferenceData(prismaClient, [30, 20, 10]);

      expect(prismaMock.referenceData.update).toHaveBeenNthCalledWith(1, {
        where: { id: 30 },
        data: { order: 2 },
      });
      expect(prismaMock.referenceData.update).toHaveBeenNthCalledWith(2, {
        where: { id: 20 },
        data: { order: 1 },
      });
      expect(prismaMock.referenceData.update).toHaveBeenNthCalledWith(3, {
        where: { id: 10 },
        data: { order: 0 },
      });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("deleteReferenceData", () => {
    it("should delete referenceData by id", async () => {
      const referenceData = mockReferenceData();
      prismaMock.referenceData.delete.mockResolvedValue(referenceData);

      const result = await deleteReferenceData(prismaClient, 1);

      expect(result).toEqual(referenceData);
      expect(prismaMock.referenceData.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });
});
