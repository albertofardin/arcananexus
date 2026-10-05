import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { createAction } from "./action.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import { mockAction } from "@/test/helpers/prisma-fixtures";

describe("Action Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createAction", () => {
    it("should create an action with the given fields, defaulting the optional ones", async () => {
      const input = {
        characterId: 1,
        featureId: 2,
      };
      const created = mockAction(input);
      prismaMock.action.create.mockResolvedValue(created);

      const result = await createAction(prismaClient, input);

      expect(result).toEqual(created);
      expect(prismaMock.action.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          featureId: 2,
          actionData: undefined,
          // Default a `null` quando non passato (T-0xx, `Action.authorUserId`).
          authorUserId: null,
        },
      });
    });

    it("should persist actionData when provided", async () => {
      const input = {
        characterId: 1,
        featureId: 2,
        actionData: { referenceDataId: 10 },
      };
      prismaMock.action.create.mockResolvedValue(mockAction(input));

      await createAction(prismaClient, input);

      expect(prismaMock.action.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          featureId: 2,
          actionData: { referenceDataId: 10 },
          authorUserId: null,
        },
      });
    });

    it("should persist authorUserId when provided (T-0xx, missiva 'a nome del master')", async () => {
      const input = {
        characterId: null,
        featureId: 2,
        actionData: { subject: "Convocazione" },
        authorUserId: "master-1",
      };
      prismaMock.action.create.mockResolvedValue(
        mockAction({ ...input, authorUserId: "master-1" })
      );

      await createAction(prismaClient, input);

      expect(prismaMock.action.create).toHaveBeenCalledWith({
        data: {
          characterId: null,
          featureId: 2,
          actionData: { subject: "Convocazione" },
          authorUserId: "master-1",
        },
      });
    });

    it("should map an explicit null actionData to Prisma.JsonNull", async () => {
      prismaMock.action.create.mockResolvedValue(
        mockAction({ actionData: undefined })
      );

      await createAction(prismaClient, {
        characterId: 1,
        featureId: 2,
        actionData: null,
      });

      expect(prismaMock.action.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ actionData: Prisma.JsonNull }),
        })
      );
    });
  });
});
