import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createFeatureType,
  createFeatureTypesIfMissing,
  getFeatureTypeByFunctionName,
  getFeatureTypeById,
  listFeatureTypes,
} from "./featureType.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import { mockFeatureType } from "@/test/helpers/prisma-fixtures";

describe("FeatureType Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listFeatureTypes", () => {
    it("should list every feature type ordered by name", async () => {
      const rows = [mockFeatureType({ id: 1 })];
      prismaMock.featureType.findMany.mockResolvedValue(rows);

      const result = await listFeatureTypes(prismaClient);

      expect(result).toEqual(rows);
      expect(prismaMock.featureType.findMany).toHaveBeenCalledWith({
        orderBy: { featureName: "asc" },
      });
    });
  });

  describe("getFeatureTypeById", () => {
    it("should return the matching feature type", async () => {
      const row = mockFeatureType({ id: 1 });
      prismaMock.featureType.findUnique.mockResolvedValue(row);

      const result = await getFeatureTypeById(prismaClient, 1);

      expect(result).toEqual(row);
      expect(prismaMock.featureType.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it("should return null when not found", async () => {
      prismaMock.featureType.findUnique.mockResolvedValue(null);

      const result = await getFeatureTypeById(prismaClient, 999);

      expect(result).toBeNull();
    });
  });

  describe("getFeatureTypeByFunctionName", () => {
    it("should look up by functionName (no unique DB constraint, findFirst)", async () => {
      const row = mockFeatureType({ functionName: "talents" });
      prismaMock.featureType.findFirst.mockResolvedValue(row);

      const result = await getFeatureTypeByFunctionName(
        prismaClient,
        "talents"
      );

      expect(result).toEqual(row);
      expect(prismaMock.featureType.findFirst).toHaveBeenCalledWith({
        where: { functionName: "talents" },
      });
    });
  });

  describe("createFeatureTypesIfMissing", () => {
    it("bulk-inserts with skipDuplicates when given rows", async () => {
      const rows = [
        {
          featureName: "Apprendi talento",
          functionName: "talents",
          actionSchema: { type: "object" },
          featureSchema: { type: "object" },
        },
      ];

      await createFeatureTypesIfMissing(prismaClient, rows);

      expect(prismaMock.featureType.createMany).toHaveBeenCalledWith({
        data: rows,
        skipDuplicates: true,
      });
    });

    it("does not call the database when there is nothing to insert", async () => {
      await createFeatureTypesIfMissing(prismaClient, []);

      expect(prismaMock.featureType.createMany).not.toHaveBeenCalled();
    });
  });

  describe("createFeatureType", () => {
    it("should create a feature type with the given fields", async () => {
      const input = {
        featureName: "Apprendi talento",
        functionName: "talents",
        actionSchema: { type: "object" },
        featureSchema: { type: "object" },
      };
      const created = mockFeatureType(input);
      prismaMock.featureType.create.mockResolvedValue(created);

      const result = await createFeatureType(prismaClient, input);

      expect(result).toEqual(created);
      expect(prismaMock.featureType.create).toHaveBeenCalledWith({
        data: input,
      });
    });
  });
});
