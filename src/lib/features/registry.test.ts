import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";
import {
  ActionDataValidationError,
  UnknownFeatureFunctionError,
  __resetRegistryForTests,
  ensureFeatureTypesRegistered,
  executeFeatureAction,
  getFeatureHandler,
  listRegisteredFeatureHandlers,
  registerFeatureHandler,
} from "./registry";
import {
  mockAction,
  mockCampaign,
  mockCharacter,
  mockFeature,
} from "@/test/helpers/prisma-fixtures";
import { prismaClient, prismaMock } from "@/test/mocks/prisma";

const testActionSchema = z
  .object({ amount: z.number().int().positive() })
  .strict();

describe("Feature registry (T-019)", () => {
  beforeEach(() => {
    __resetRegistryForTests();
    vi.clearAllMocks();
  });

  describe("registerFeatureHandler / getFeatureHandler", () => {
    it("resolves a registered handler by functionName", () => {
      const handler = vi.fn();
      registerFeatureHandler({
        featureName: "Test",
        functionName: "testFunction",
        actionSchema: testActionSchema,
        featureSchema: z.object({}).strict(),
        handler,
      });

      const definition = getFeatureHandler("testFunction");

      expect(definition.functionName).toBe("testFunction");
      expect(definition.handler).toBe(handler);
    });

    it("throws UnknownFeatureFunctionError (handled, no crash) for an unregistered functionName", () => {
      expect(() => getFeatureHandler("doesNotExist")).toThrow(
        UnknownFeatureFunctionError
      );
    });

    // QA (T-019): il registry usa una `Map`, non un object literal — a
    // differenza del buco di prototype-pollution trovato in T-026 round 1,
    // una chiave che collide con `Object.prototype` non deve mai risolvere a
    // un valore ereditato: deve comportarsi come qualunque altra chiave
    // sconosciuta (errore gestito, no crash).
    it.each(["toString", "constructor", "hasOwnProperty", "__proto__"])(
      "treats %s as an unregistered functionName (no Object.prototype leak)",
      functionName => {
        expect(() => getFeatureHandler(functionName)).toThrow(
          UnknownFeatureFunctionError
        );
      }
    );

    it("lists every registered handler", () => {
      registerFeatureHandler({
        featureName: "Test A",
        functionName: "testA",
        actionSchema: testActionSchema,
        featureSchema: z.object({}).strict(),
        handler: vi.fn(),
      });
      registerFeatureHandler({
        featureName: "Test B",
        functionName: "testB",
        actionSchema: testActionSchema,
        featureSchema: z.object({}).strict(),
        handler: vi.fn(),
      });

      const functionNames = listRegisteredFeatureHandlers().map(
        d => d.functionName
      );
      expect(functionNames).toEqual(expect.arrayContaining(["testA", "testB"]));
    });
  });

  describe("ensureFeatureTypesRegistered", () => {
    // Fix bug T-019 follow-up (feature assenti su staging: DB mai seedato) —
    // il catalogo `FeatureType` deve auto-provisionarsi dal registry di
    // codice ad ogni lettura, non solo da `prisma db seed`.
    it("upserts a FeatureType (skipDuplicates) for every registered handler, JSON-schema included", async () => {
      registerFeatureHandler({
        featureName: "Test A",
        functionName: "testA",
        actionSchema: testActionSchema,
        featureSchema: z.object({}).strict(),
        handler: vi.fn(),
      });

      await ensureFeatureTypesRegistered(prismaClient);

      expect(prismaMock.featureType.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            featureName: "Test A",
            functionName: "testA",
            actionSchema: expect.any(Object),
            featureSchema: expect.any(Object),
          }),
        ],
        skipDuplicates: true,
      });
    });

    it("does nothing when the registry is empty", async () => {
      await ensureFeatureTypesRegistered(prismaClient);

      expect(prismaMock.featureType.createMany).not.toHaveBeenCalled();
    });

    // Regressione staging: `z.coerce.date()` (es. `readDate` in
    // handlers/missive.ts) fa lanciare `z.toJSONSchema` di default ("Date
    // cannot be represented in JSON Schema"), 500 su GET /api/feature-types.
    it("does not throw for a featureSchema containing a Date field", async () => {
      registerFeatureHandler({
        featureName: "Test Date",
        functionName: "testDate",
        actionSchema: testActionSchema,
        featureSchema: z
          .object({ readDate: z.coerce.date().nullable().default(null) })
          .strict(),
        handler: vi.fn(),
      });

      await expect(
        ensureFeatureTypesRegistered(prismaClient)
      ).resolves.not.toThrow();
    });
  });

  describe("executeFeatureAction", () => {
    const character = mockCharacter({ id: 1, campaignId: 1 });
    const feature = mockFeature({ id: 2, campaignId: 1 });
    const campaign = mockCampaign({ id: 1 });

    it("throws UnknownFeatureFunctionError for an unregistered functionName, without calling any handler", async () => {
      await expect(
        executeFeatureAction(prismaClient, {
          functionName: "doesNotExist",
          character,
          feature,
          actionData: { amount: 1 },
          campaign,
        })
      ).rejects.toBeInstanceOf(UnknownFeatureFunctionError);
    });

    it("validates actionData against the resolved handler's actionSchema before invoking it", async () => {
      const handler = vi.fn();
      registerFeatureHandler({
        featureName: "Test",
        functionName: "testFunction",
        actionSchema: testActionSchema,
        featureSchema: z.object({}).strict(),
        handler,
      });

      await expect(
        executeFeatureAction(prismaClient, {
          functionName: "testFunction",
          character,
          feature,
          actionData: { amount: -5 },
          campaign,
        })
      ).rejects.toBeInstanceOf(ActionDataValidationError);
      expect(handler).not.toHaveBeenCalled();
    });

    it("invokes the handler with the parsed actionData and returns its result", async () => {
      const action = mockAction({ id: 9 });
      const handler = vi.fn().mockResolvedValue({ action });
      registerFeatureHandler({
        featureName: "Test",
        functionName: "testFunction",
        actionSchema: testActionSchema,
        featureSchema: z.object({}).strict(),
        handler,
      });

      const result = await executeFeatureAction(prismaClient, {
        functionName: "testFunction",
        character,
        feature,
        actionData: { amount: 5 },
        campaign,
      });

      expect(result).toEqual({ action });
      expect(handler).toHaveBeenCalledWith(prismaClient, {
        character,
        feature,
        campaign,
        actionData: { amount: 5 },
      });
    });
  });
});
