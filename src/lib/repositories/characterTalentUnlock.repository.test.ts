import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  listUnlockedReferenceDataIdsForCharacter,
  upsertCharacterTalentUnlock,
  deleteCharacterTalentUnlock,
} from "./characterTalentUnlock.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";

describe("CharacterTalentUnlock Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listUnlockedReferenceDataIdsForCharacter", () => {
    it("restituisce solo gli id delle ReferenceData sbloccate per il personaggio", async () => {
      prismaMock.characterTalentUnlock.findMany.mockResolvedValue([
        { referenceDataId: 5 },
        { referenceDataId: 7 },
      ] as never);

      const result = await listUnlockedReferenceDataIdsForCharacter(
        prismaClient,
        1
      );

      expect(result).toEqual([5, 7]);
      expect(prismaMock.characterTalentUnlock.findMany).toHaveBeenCalledWith({
        where: { characterId: 1 },
        select: { referenceDataId: true },
      });
    });
  });

  describe("upsertCharacterTalentUnlock", () => {
    it("crea o riusa l'eccezione via upsert su characterId+referenceDataId", async () => {
      prismaMock.characterTalentUnlock.upsert.mockResolvedValue({
        id: 1,
        characterId: 1,
        referenceDataId: 5,
        unlockedById: "user-1",
        createdAt: new Date("2024-01-01"),
      });

      await upsertCharacterTalentUnlock(prismaClient, {
        characterId: 1,
        referenceDataId: 5,
        unlockedById: "user-1",
      });

      expect(prismaMock.characterTalentUnlock.upsert).toHaveBeenCalledWith({
        where: {
          characterId_referenceDataId: { characterId: 1, referenceDataId: 5 },
        },
        create: { characterId: 1, referenceDataId: 5, unlockedById: "user-1" },
        update: {},
      });
    });
  });

  describe("deleteCharacterTalentUnlock", () => {
    it("rimuove l'eccezione con deleteMany (idempotente se già assente)", async () => {
      prismaMock.characterTalentUnlock.deleteMany.mockResolvedValue({
        count: 1,
      });

      await deleteCharacterTalentUnlock(prismaClient, 1, 5);

      expect(prismaMock.characterTalentUnlock.deleteMany).toHaveBeenCalledWith({
        where: { characterId: 1, referenceDataId: 5 },
      });
    });
  });
});
