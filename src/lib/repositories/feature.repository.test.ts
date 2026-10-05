import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createFeature,
  getFeatureByFunctionName,
  getFeatureByIdScoped,
  listFeaturesForCampaign,
  updateFeature,
} from "./feature.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import { mockFeature, mockFeatureType } from "@/test/helpers/prisma-fixtures";

describe("Feature Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listFeaturesForCampaign", () => {
    it("should list every feature configured for the campaign, with its featureType", async () => {
      const rows = [
        { ...mockFeature({ campaignId: 1 }), featureType: mockFeatureType() },
      ];
      prismaMock.feature.findMany.mockResolvedValue(rows);

      const result = await listFeaturesForCampaign(prismaClient, 1);

      expect(result).toEqual(rows);
      expect(prismaMock.feature.findMany).toHaveBeenCalledWith({
        where: { campaignId: 1 },
        orderBy: { id: "asc" },
        include: { featureType: true },
      });
    });
  });

  describe("getFeatureByIdScoped", () => {
    it("should scope the lookup to the given campaign", async () => {
      const row = {
        ...mockFeature({ id: 5, campaignId: 1 }),
        featureType: mockFeatureType(),
      };
      prismaMock.feature.findUnique.mockResolvedValue(row);

      const result = await getFeatureByIdScoped(prismaClient, 5, 1);

      expect(result).toEqual(row);
      expect(prismaMock.feature.findUnique).toHaveBeenCalledWith({
        where: { id: 5, campaignId: 1 },
        include: { featureType: true },
      });
    });

    it("should return null for a feature belonging to another campaign", async () => {
      prismaMock.feature.findUnique.mockResolvedValue(null);

      const result = await getFeatureByIdScoped(prismaClient, 5, 2);

      expect(result).toBeNull();
    });
  });

  describe("getFeatureByFunctionName", () => {
    it("should resolve the campaign's active Feature for the given functionName (activeOnly defaults to true)", async () => {
      const row = {
        ...mockFeature({ id: 5, campaignId: 1 }),
        featureType: mockFeatureType({ functionName: "talents" }),
      };
      prismaMock.feature.findFirst.mockResolvedValue(row);

      const result = await getFeatureByFunctionName(prismaClient, 1, "talents");

      expect(result).toEqual(row);
      expect(prismaMock.feature.findFirst).toHaveBeenCalledWith({
        where: {
          campaignId: 1,
          featureType: { functionName: "talents" },
          active: true,
        },
        orderBy: { id: "asc" },
        include: { featureType: true },
      });
    });

    // T-0xx (soft-toggle): `activeOnly: false` è il "segnale grezzo" usato
    // dalla scheda personaggio per distinguere "mai configurata" da
    // "disattivata" — non deve filtrare per `active` nel `where`.
    it("should include disabled Features when activeOnly is false", async () => {
      const row = {
        ...mockFeature({ id: 5, campaignId: 1, active: false }),
        featureType: mockFeatureType({ functionName: "talents" }),
      };
      prismaMock.feature.findFirst.mockResolvedValue(row);

      const result = await getFeatureByFunctionName(
        prismaClient,
        1,
        "talents",
        { activeOnly: false }
      );

      expect(result).toEqual(row);
      expect(prismaMock.feature.findFirst).toHaveBeenCalledWith({
        where: {
          campaignId: 1,
          featureType: { functionName: "talents" },
        },
        orderBy: { id: "asc" },
        include: { featureType: true },
      });
    });

    it("should return null when the campaign has not activated that function", async () => {
      prismaMock.feature.findFirst.mockResolvedValue(null);

      const result = await getFeatureByFunctionName(
        prismaClient,
        1,
        "unknownFunction"
      );

      expect(result).toBeNull();
    });
  });

  describe("createFeature", () => {
    // T-0xx: `prisma.feature.upsert` (non più `findUnique` + `create`/
    // `update`) — atomico, così due chiamate concorrenti sulla stessa coppia
    // `(featureTypeId, campaignId)` non possono più violare il vincolo unique
    // (`P2002`, entrambe leggerebbero `null` con un `findUnique` separato).
    it("should upsert on (featureTypeId, campaignId), creating when none exists yet", async () => {
      const input = {
        campaignId: 1,
        featureTypeId: 2,
        featureData: { recoveryPercentage: 50 },
      };
      const created = { ...mockFeature(input), featureType: mockFeatureType() };
      prismaMock.feature.upsert.mockResolvedValue(created);

      const result = await createFeature(prismaClient, input);

      expect(result).toEqual(created);
      expect(prismaMock.feature.upsert).toHaveBeenCalledWith({
        where: {
          featureTypeId_campaignId: { featureTypeId: 2, campaignId: 1 },
        },
        create: input,
        update: { featureData: input.featureData, active: true },
        include: { featureType: true },
      });
    });

    // T-0xx (soft-toggle, `@@unique([featureTypeId, campaignId])`): riattivare
    // una funzione disattivata deve riusare la riga esistente (branch
    // `update` dell'upsert), MAI crearne una seconda — violerebbe il vincolo
    // unique e, cosa più importante, perderebbe la relazione con le `Action`
    // già create contro quella `Feature`.
    it("should reactivate and update an existing (even disabled) feature instead of creating a duplicate", async () => {
      const input = {
        campaignId: 1,
        featureTypeId: 2,
        featureData: { recoveryPercentage: 75 },
      };
      const updated = {
        ...mockFeature({
          id: 9,
          campaignId: 1,
          featureTypeId: 2,
          featureData: input.featureData,
          active: true,
        }),
        featureType: mockFeatureType(),
      };
      prismaMock.feature.upsert.mockResolvedValue(updated);

      const result = await createFeature(prismaClient, input);

      expect(result).toEqual(updated);
      expect(prismaMock.feature.upsert).toHaveBeenCalledWith({
        where: {
          featureTypeId_campaignId: { featureTypeId: 2, campaignId: 1 },
        },
        create: input,
        update: { featureData: input.featureData, active: true },
        include: { featureType: true },
      });
    });
  });

  describe("updateFeature", () => {
    it("should update only featureData", async () => {
      const updated = {
        ...mockFeature({ id: 5, featureData: { recoveryPercentage: 75 } }),
        featureType: mockFeatureType(),
      };
      prismaMock.feature.update.mockResolvedValue(updated);

      const result = await updateFeature(prismaClient, 5, {
        featureData: { recoveryPercentage: 75 },
      });

      expect(result).toEqual(updated);
      expect(prismaMock.feature.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { featureData: { recoveryPercentage: 75 } },
        include: { featureType: true },
      });
    });

    // T-0xx (soft-toggle): il caso "disattiva/riattiva" non deve toccare
    // `featureData` — entrambi i campi sono opzionali e aggiornati solo se
    // passati.
    it("should update only active, leaving featureData untouched", async () => {
      const updated = {
        ...mockFeature({ id: 5, active: false }),
        featureType: mockFeatureType(),
      };
      prismaMock.feature.update.mockResolvedValue(updated);

      const result = await updateFeature(prismaClient, 5, { active: false });

      expect(result).toEqual(updated);
      expect(prismaMock.feature.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { active: false },
        include: { featureType: true },
      });
    });
  });
});
