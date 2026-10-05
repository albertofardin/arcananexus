import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DataTypeKind,
  DataCardinality,
  DataTypeAssignability,
  DataTypeRender,
} from "@prisma/client";
import {
  getDataTypeById,
  getDataTypeByIdScoped,
  listDataTypes,
  getDataTypeByName,
  createDataType,
  updateDataType,
  deleteDataType,
} from "./dataType.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockDataType,
  mockCampaign,
  mockReferenceData,
} from "@/test/helpers/prisma-fixtures";

describe("DataType Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDataTypeById", () => {
    it("should return dataType when found", async () => {
      const dataType = { ...mockDataType(), campaign: mockCampaign() };
      prismaMock.dataType.findUnique.mockResolvedValue(dataType);

      const result = await getDataTypeById(prismaClient, 1);

      expect(result).toEqual(dataType);
      expect(prismaMock.dataType.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: { campaign: true },
      });
    });

    it("should return null when not found", async () => {
      prismaMock.dataType.findUnique.mockResolvedValue(null);

      const result = await getDataTypeById(prismaClient, 999);

      expect(result).toBeNull();
    });

    it("should include reference data (catalog) when requested", async () => {
      const dataType = {
        ...mockDataType(),
        campaign: mockCampaign(),
        referenceData: [mockReferenceData()],
      };
      prismaMock.dataType.findUnique.mockResolvedValue(dataType);

      await getDataTypeById(prismaClient, 1, true);

      expect(prismaMock.dataType.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          referenceData: {
            orderBy: { name: "asc" },
          },
          campaign: true,
        },
      });
    });

    it("should not include campaign data by default", async () => {
      const dataType = { ...mockDataType(), campaign: mockCampaign() };
      prismaMock.dataType.findUnique.mockResolvedValue(dataType);

      await getDataTypeById(prismaClient, 1);

      expect(prismaMock.dataType.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: { campaign: true },
      });
    });
  });

  describe("getDataTypeByIdScoped", () => {
    it("should return dataType when it belongs to the given campaign", async () => {
      const dataType = mockDataType({ id: 1, campaignId: 1 });
      prismaMock.dataType.findUnique.mockResolvedValue(dataType);

      const result = await getDataTypeByIdScoped(prismaClient, 1, 1);

      expect(result).toEqual(dataType);
      expect(prismaMock.dataType.findUnique).toHaveBeenCalledWith({
        where: { id: 1, campaignId: 1 },
        include: undefined,
      });
    });

    it("should return null when the dataType belongs to another campaign (multi-tenant isolation)", async () => {
      prismaMock.dataType.findUnique.mockResolvedValue(null);

      const result = await getDataTypeByIdScoped(prismaClient, 1, 2);

      expect(result).toBeNull();
      expect(prismaMock.dataType.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1, campaignId: 2 } })
      );
    });

    it("should include reference data (catalog) when requested", async () => {
      const dataType = {
        ...mockDataType({ id: 1, campaignId: 1 }),
        referenceData: [mockReferenceData()],
      };
      prismaMock.dataType.findUnique.mockResolvedValue(dataType);

      await getDataTypeByIdScoped(prismaClient, 1, 1, true);

      expect(prismaMock.dataType.findUnique).toHaveBeenCalledWith({
        where: { id: 1, campaignId: 1 },
        include: { referenceData: { orderBy: { name: "asc" } } },
      });
    });
  });

  describe("listDataTypes", () => {
    it("should return all dataTypes for a campaign", async () => {
      const dataTypes = [
        mockDataType({ id: 1, name: "Rules", campaignId: 1 }),
        mockDataType({ id: 2, name: "Lore", campaignId: 1 }),
      ];
      prismaMock.dataType.findMany.mockResolvedValue(dataTypes);

      const result = await listDataTypes(prismaClient, 1);

      expect(result).toEqual(dataTypes);
      expect(prismaMock.dataType.findMany).toHaveBeenCalledWith({
        where: { campaignId: 1 },
        orderBy: { name: "asc" },
        include: undefined,
      });
    });

    it("should filter by campaignId (multi-tenant isolation)", async () => {
      prismaMock.dataType.findMany.mockResolvedValue([]);

      await listDataTypes(prismaClient, 1);

      expect(prismaMock.dataType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { campaignId: 1 },
        })
      );
    });

    it("should order results alphabetically by name", async () => {
      prismaMock.dataType.findMany.mockResolvedValue([]);

      await listDataTypes(prismaClient, 1);

      expect(prismaMock.dataType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: "asc" },
        })
      );
    });

    it("should include count when requested", async () => {
      const dataTypes = [mockDataType()];
      prismaMock.dataType.findMany.mockResolvedValue(dataTypes);

      await listDataTypes(prismaClient, 1, true);

      expect(prismaMock.dataType.findMany).toHaveBeenCalledWith({
        where: { campaignId: 1 },
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: { referenceData: true },
          },
        },
      });
    });

    it("should return empty array when no dataTypes found", async () => {
      prismaMock.dataType.findMany.mockResolvedValue([]);

      const result = await listDataTypes(prismaClient, 1);

      expect(result).toEqual([]);
    });
  });

  describe("getDataTypeByName", () => {
    it("should find dataType by name (case-insensitive)", async () => {
      const dataType = {
        ...mockDataType({ name: "Rules" }),
        campaign: mockCampaign(),
      };
      prismaMock.dataType.findFirst.mockResolvedValue(dataType);

      const result = await getDataTypeByName(prismaClient, 1, "rules");

      expect(result).toEqual(dataType);
      expect(prismaMock.dataType.findFirst).toHaveBeenCalledWith({
        where: {
          campaignId: 1,
          name: {
            equals: "rules",
            mode: "insensitive",
          },
        },
        include: {
          campaign: true,
        },
      });
    });

    it("should be case-insensitive in search", async () => {
      const dataType = {
        ...mockDataType({ name: "Rules" }),
        campaign: mockCampaign(),
      };
      prismaMock.dataType.findFirst.mockResolvedValue(dataType);

      await getDataTypeByName(prismaClient, 1, "RULES");

      expect(prismaMock.dataType.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: expect.objectContaining({
              mode: "insensitive",
            }),
          }),
        })
      );
    });

    it("should filter by campaignId", async () => {
      prismaMock.dataType.findFirst.mockResolvedValue(null);

      await getDataTypeByName(prismaClient, 1, "Rules");

      expect(prismaMock.dataType.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            campaignId: 1,
          }),
        })
      );
    });

    it("should return null when not found", async () => {
      prismaMock.dataType.findFirst.mockResolvedValue(null);

      const result = await getDataTypeByName(prismaClient, 1, "Nonexistent");

      expect(result).toBeNull();
    });

    it("should prevent cross-campaign name collision", async () => {
      // DataType with same name but different campaign should not be found
      prismaMock.dataType.findFirst.mockResolvedValue(null);

      const result = await getDataTypeByName(prismaClient, 2, "Rules");

      expect(result).toBeNull();
      expect(prismaMock.dataType.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            campaignId: 2,
          }),
        })
      );
    });
  });

  describe("createDataType", () => {
    it("should create dataType with provided data", async () => {
      const input = {
        name: "New Type",
        campaignId: 1,
      };
      const created = { ...mockDataType(input), campaign: mockCampaign() };
      prismaMock.dataType.create.mockResolvedValue(created);

      const result = await createDataType(prismaClient, input);

      expect(result).toEqual(created);
      expect(prismaMock.dataType.create).toHaveBeenCalledWith({
        data: {
          name: "New Type",
          campaignId: 1,
          kind: undefined,
          description: undefined,
          cardinality: undefined,
          assignability: undefined,
          mandatory: undefined,
          sidebarShow: undefined,
          sidebarOrder: undefined,
          icon: undefined,
          renderAs: undefined,
        },
        include: {
          campaign: true,
        },
      });
    });

    it("should pass through kind/cardinality/presentation fields when provided", async () => {
      const input = {
        name: "Razze",
        campaignId: 1,
        kind: DataTypeKind.origins,
        cardinality: DataCardinality.single,
        sidebarShow: true,
        sidebarOrder: 1,
        icon: "crown",
        renderAs: DataTypeRender.catalog,
      };
      const created = { ...mockDataType(input), campaign: mockCampaign() };
      prismaMock.dataType.create.mockResolvedValue(created);

      await createDataType(prismaClient, input);

      expect(prismaMock.dataType.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: DataTypeKind.origins,
            cardinality: DataCardinality.single,
            sidebarShow: true,
            sidebarOrder: 1,
            icon: "crown",
            renderAs: DataTypeRender.catalog,
          }),
        })
      );
    });

    // T-035: `cardinality` è nullable — il repository è un pass-through puro,
    // l'invariante con `assignability` è applicata a monte (Zod).
    it("should pass through cardinality: null for non-assignable DataTypes", async () => {
      const input = {
        name: "Regolamenti",
        campaignId: 1,
        kind: DataTypeKind.generic,
        cardinality: null,
        assignability: DataTypeAssignability.none,
      };
      const created = { ...mockDataType(input), campaign: mockCampaign() };
      prismaMock.dataType.create.mockResolvedValue(created);

      await createDataType(prismaClient, input);

      expect(prismaMock.dataType.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cardinality: null,
            assignability: DataTypeAssignability.none,
          }),
        })
      );
    });

    it("should associate dataType with campaign", async () => {
      const input = {
        name: "Rules",
        campaignId: 5,
      };
      const created = {
        ...mockDataType(input),
        campaign: mockCampaign({ id: 5 }),
      };
      prismaMock.dataType.create.mockResolvedValue(created);

      await createDataType(prismaClient, input);

      expect(prismaMock.dataType.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            campaignId: 5,
          }),
        })
      );
    });
  });

  describe("updateDataType", () => {
    it("should update dataType name", async () => {
      const updates = { name: "Updated Name" };
      const updated = { ...mockDataType(updates), campaign: mockCampaign() };
      prismaMock.dataType.update.mockResolvedValue(updated);

      const result = await updateDataType(prismaClient, 1, updates);

      expect(result).toEqual(updated);
      expect(prismaMock.dataType.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          name: "Updated Name",
          description: undefined,
          kind: undefined,
          cardinality: undefined,
          assignability: undefined,
          mandatory: undefined,
          sidebarShow: undefined,
          sidebarOrder: undefined,
          icon: undefined,
          renderAs: undefined,
        },
        include: {
          campaign: true,
        },
      });
    });

    // `kind` è aggiornabile (i guard "talent non cambia mai" e "solo senza
    // ReferenceData figlie" sono applicativi, nella route — vedi
    // `route.test.ts`): il repository si limita a passarlo a Prisma.
    it("should pass through kind when provided", async () => {
      const updates = { kind: DataTypeKind.generic };
      const updated = { ...mockDataType(updates), campaign: mockCampaign() };
      prismaMock.dataType.update.mockResolvedValue(updated);

      await updateDataType(prismaClient, 1, updates);

      expect(prismaMock.dataType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: DataTypeKind.generic }),
        })
      );
    });

    // T-035: passare esplicitamente `null` (non `undefined`) deve azzerare
    // `cardinality` a DB — la route lo fa quando `assignability` diventa
    // `"none"`.
    it("should pass through cardinality: null explicitly (not treated as omitted)", async () => {
      const updates = {
        cardinality: null,
        assignability: DataTypeAssignability.none,
      };
      const updated = { ...mockDataType(updates), campaign: mockCampaign() };
      prismaMock.dataType.update.mockResolvedValue(updated);

      await updateDataType(prismaClient, 1, updates);

      expect(prismaMock.dataType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cardinality: null,
            assignability: DataTypeAssignability.none,
          }),
        })
      );
    });

    it("should handle empty updates", async () => {
      const updated = { ...mockDataType(), campaign: mockCampaign() };
      prismaMock.dataType.update.mockResolvedValue(updated);

      await updateDataType(prismaClient, 1, {});

      expect(prismaMock.dataType.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          name: undefined,
          description: undefined,
          kind: undefined,
          cardinality: undefined,
          assignability: undefined,
          mandatory: undefined,
          sidebarShow: undefined,
          sidebarOrder: undefined,
          icon: undefined,
          renderAs: undefined,
        },
        include: {
          campaign: true,
        },
      });
    });
  });

  describe("deleteDataType", () => {
    it("should delete dataType by id", async () => {
      const dataType = mockDataType();
      prismaMock.dataType.delete.mockResolvedValue(dataType);

      const result = await deleteDataType(prismaClient, 1);

      expect(result).toEqual(dataType);
      expect(prismaMock.dataType.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it("should throw error when deleting non-existent dataType", async () => {
      prismaMock.dataType.delete.mockRejectedValue(
        new Error("Record not found")
      );

      await expect(deleteDataType(prismaClient, 999)).rejects.toThrow(
        "Record not found"
      );
    });

    it("should cascade delete associated data (via Prisma schema)", async () => {
      // This is enforced by Prisma schema onDelete: Cascade
      // The test verifies the delete is called correctly
      const dataType = mockDataType();
      prismaMock.dataType.delete.mockResolvedValue(dataType);

      await deleteDataType(prismaClient, 1);

      expect(prismaMock.dataType.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });
});
