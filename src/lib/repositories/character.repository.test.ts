import { describe, it, expect, beforeEach, vi } from "vitest";
import { CharacterType } from "@prisma/client";
import {
  createCharacter,
  getCharacterInCampaign,
  getCharacterOwnership,
  getUserCharacterInCampaign,
  grantCharacterPointBonus,
  listCampaignCharacters,
  listCampaignCharactersForPrint,
  listCampaignCharactersForReport,
  resetCampaignPointsForActiveCharacters,
  revokeCharacterPointBonus,
  updateCharacter,
} from "./character.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import { mockCharacter } from "@/test/helpers/prisma-fixtures";

describe("Character Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCharacterInCampaign", () => {
    it("should scope the lookup to campaignId directly (no org/campaign slug)", async () => {
      const character = mockCharacter({ id: 10, campaignId: 1 });
      prismaMock.character.findUnique.mockResolvedValue(character);

      const result = await getCharacterInCampaign(prismaClient, 10, 1);

      expect(result).toEqual(character);
      expect(prismaMock.character.findUnique).toHaveBeenCalledWith({
        where: { id: 10, campaignId: 1 },
      });
    });

    it("should return null for a character belonging to another campaign", async () => {
      prismaMock.character.findUnique.mockResolvedValue(null);

      const result = await getCharacterInCampaign(prismaClient, 10, 2);

      expect(result).toBeNull();
    });
  });

  describe("listCampaignCharacters", () => {
    it("scopes to the given campaign and includes the owning user", async () => {
      prismaMock.character.findMany.mockResolvedValue([]);

      await listCampaignCharacters(prismaClient, 1);

      expect(prismaMock.character.findMany).toHaveBeenCalledWith({
        where: { campaignId: 1 },
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
        orderBy: [{ name: "asc" }],
      });
    });

    it("returns every character regardless of owner", async () => {
      const characters = [
        mockCharacter({ id: 1, userId: "user-1" }),
        mockCharacter({ id: 2, userId: "user-2" }),
      ];
      prismaMock.character.findMany.mockResolvedValue(characters as never);

      const result = await listCampaignCharacters(prismaClient, 1);

      expect(result).toEqual(characters);
    });
  });

  describe("listCampaignCharactersForPrint", () => {
    it("scopes to the campaign and selects status dates and booked events", async () => {
      prismaMock.character.findMany.mockResolvedValue([]);

      await listCampaignCharactersForPrint(prismaClient, 1);

      expect(prismaMock.character.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { campaignId: 1 },
          select: expect.objectContaining({
            deathDate: true,
            parkDate: true,
            approvalDate: true,
            bookings: {
              select: {
                event: {
                  select: { id: true, name: true, dateEventStart: true },
                },
              },
            },
          }),
        })
      );
    });
  });

  describe("listCampaignCharactersForReport", () => {
    it("selects the status dates, type, owner name and per-category data", async () => {
      prismaMock.character.findMany.mockResolvedValue([]);

      await listCampaignCharactersForReport(prismaClient, 1);

      expect(prismaMock.character.findMany).toHaveBeenCalledWith({
        where: { campaignId: 1 },
        select: {
          id: true,
          name: true,
          type: true,
          avatar: true,
          lastUpdateDate: true,
          approvalDate: true,
          parkDate: true,
          deathDate: true,
          user: { select: { name: true } },
          characterData: {
            select: {
              id: true,
              referenceData: { select: { name: true } },
              dataType: {
                select: { id: true, name: true, kind: true, cardinality: true },
              },
            },
          },
        },
        orderBy: [{ name: "asc" }],
      });
    });

    it("returns every character regardless of owner", async () => {
      const rows = [
        {
          id: 1,
          name: "Aria",
          type: "pg",
          approvalDate: new Date("2024-01-01"),
          parkDate: null,
          deathDate: null,
          user: { name: "Player One" },
          characterData: [
            {
              id: 1,
              referenceData: { name: "Umano" },
              dataType: {
                id: 1,
                name: "Razza",
                kind: "origins",
                cardinality: "single",
              },
            },
          ],
        },
      ];
      prismaMock.character.findMany.mockResolvedValue(rows as never);

      const result = await listCampaignCharactersForReport(prismaClient, 1);

      expect(result).toEqual(rows);
    });
  });

  describe("getCharacterOwnership", () => {
    it("selects ownership fields plus the status-derivation dates", async () => {
      prismaMock.character.findUnique.mockResolvedValue({
        id: 1,
        userId: "user-1",
        campaignId: 2,
        avatar: null,
        approvalDate: null,
        parkDate: null,
        deathDate: null,
        campaign: { slug: "test-campaign" },
      } as never);

      const result = await getCharacterOwnership(prismaClient, 1);

      expect(result).toEqual({
        id: 1,
        userId: "user-1",
        campaignId: 2,
        avatar: null,
        approvalDate: null,
        parkDate: null,
        deathDate: null,
        campaign: { slug: "test-campaign" },
      });
      expect(prismaMock.character.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: {
          id: true,
          userId: true,
          campaignId: true,
          avatar: true,
          approvalDate: true,
          parkDate: true,
          deathDate: true,
          campaign: { select: { slug: true } },
        },
      });
    });

    it("returns null when not found", async () => {
      prismaMock.character.findUnique.mockResolvedValue(null);

      const result = await getCharacterOwnership(prismaClient, 999);

      expect(result).toBeNull();
    });
  });

  describe("getUserCharacterInCampaign", () => {
    it("scopes the lookup to userId and campaignId", async () => {
      const character = mockCharacter({ userId: "user-1", campaignId: 2 });
      prismaMock.character.findFirst.mockResolvedValue(character);

      const result = await getUserCharacterInCampaign(
        prismaClient,
        "user-1",
        2
      );

      expect(result).toEqual(character);
      expect(prismaMock.character.findFirst).toHaveBeenCalledWith({
        where: { userId: "user-1", campaignId: 2 },
        orderBy: [
          { deathDate: { sort: "desc", nulls: "first" } },
          { approvalDate: { sort: "desc", nulls: "first" } },
          { creationDate: "desc" },
        ],
      });
    });

    it("returns null when the user has no character in the campaign", async () => {
      prismaMock.character.findFirst.mockResolvedValue(null);

      const result = await getUserCharacterInCampaign(
        prismaClient,
        "user-1",
        2
      );

      expect(result).toBeNull();
    });
  });

  describe("createCharacter", () => {
    it("creates a PNG already approved, without requiring manual review", async () => {
      prismaMock.character.create.mockResolvedValue(mockCharacter());

      await createCharacter(prismaClient, {
        campaignId: 1,
        userId: "user-1",
        name: "Guardia",
        type: CharacterType.png,
      });

      expect(prismaMock.character.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: CharacterType.png,
            approvalDate: expect.any(Date),
          }),
        })
      );
    });

    it("leaves a PG in review (no approvalDate) by default", async () => {
      prismaMock.character.create.mockResolvedValue(mockCharacter());

      await createCharacter(prismaClient, {
        campaignId: 1,
        userId: "user-1",
        name: "Eroe",
        type: CharacterType.pg,
      });

      expect(prismaMock.character.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ approvalDate: undefined }),
        })
      );
    });

    it("does not override an explicit approvalDate for a PNG", async () => {
      prismaMock.character.create.mockResolvedValue(mockCharacter());

      await createCharacter(prismaClient, {
        campaignId: 1,
        userId: "user-1",
        name: "Guardia",
        type: CharacterType.png,
        approvalDate: null,
      });

      expect(prismaMock.character.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ approvalDate: null }),
        })
      );
    });
  });

  describe("updateCharacter", () => {
    it("updates the given fields and stamps lastUpdateDate", async () => {
      const updated = mockCharacter({ name: "Nuovo Nome" });
      prismaMock.character.update.mockResolvedValue(updated);

      const result = await updateCharacter(prismaClient, 1, {
        name: "Nuovo Nome",
      });

      expect(result).toEqual(updated);
      expect(prismaMock.character.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            name: "Nuovo Nome",
            lastUpdateDate: expect.any(Date),
          }),
        })
      );
    });

    it("includes campaign and user display relations", async () => {
      prismaMock.character.update.mockResolvedValue(mockCharacter());

      await updateCharacter(prismaClient, 1, { background: "Aggiornato" });

      expect(prismaMock.character.update).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            campaign: {
              select: {
                name: true,
                slug: true,
                organization: { select: { slug: true } },
              },
            },
            user: { select: { name: true } },
          },
        })
      );
    });
  });

  describe("grantCharacterPointBonus", () => {
    it("increments both the counter and the personal bonus cap by 1 (downtime)", async () => {
      prismaMock.character.update.mockResolvedValue(mockCharacter());

      await grantCharacterPointBonus(prismaClient, 1, "downtimePoints");

      expect(prismaMock.character.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          downtimePoints: { increment: 1 },
          downtimePointsBonus: { increment: 1 },
        },
      });
    });

    it("increments both the counter and the personal bonus cap by 1 (missive)", async () => {
      prismaMock.character.update.mockResolvedValue(mockCharacter());

      await grantCharacterPointBonus(prismaClient, 1, "missivePoints");

      expect(prismaMock.character.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          missivePoints: { increment: 1 },
          missivePointsBonus: { increment: 1 },
        },
      });
    });
  });

  describe("revokeCharacterPointBonus", () => {
    it("decrements both the counter and the personal bonus cap by 1", async () => {
      prismaMock.character.findUniqueOrThrow.mockResolvedValue({
        downtimePoints: 3,
        downtimePointsBonus: 2,
        missivePoints: 0,
        missivePointsBonus: 0,
      } as never);
      prismaMock.character.update.mockResolvedValue(mockCharacter());

      await revokeCharacterPointBonus(prismaClient, 1, "downtimePoints");

      expect(prismaMock.character.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { downtimePoints: 2, downtimePointsBonus: 1 },
      });
    });

    it("floors both counters at 0 instead of going negative", async () => {
      prismaMock.character.findUniqueOrThrow.mockResolvedValue({
        downtimePoints: 0,
        downtimePointsBonus: 0,
        missivePoints: 0,
        missivePointsBonus: 0,
      } as never);
      prismaMock.character.update.mockResolvedValue(mockCharacter());

      await revokeCharacterPointBonus(prismaClient, 1, "missivePoints");

      expect(prismaMock.character.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { missivePoints: 0, missivePointsBonus: 0 },
      });
    });
  });

  describe("resetCampaignPointsForActiveCharacters", () => {
    it("resets each active character to the campaign max PLUS their own personal bonus cap", async () => {
      prismaMock.character.findMany.mockResolvedValue([
        mockCharacter({ id: 1, downtimePointsBonus: 0 }),
        mockCharacter({ id: 2, downtimePointsBonus: 2 }),
      ]);
      prismaMock.$transaction.mockImplementation((async (
        updates: Promise<unknown>[]
      ) => Promise.all(updates)) as never);

      const result = await resetCampaignPointsForActiveCharacters(
        prismaClient,
        1,
        "downtimePoints",
        5
      );

      expect(result).toEqual({ count: 2 });
      expect(prismaMock.character.findMany).toHaveBeenCalledWith({
        where: {
          campaignId: 1,
          deathDate: null,
          parkDate: null,
          approvalDate: { not: null },
        },
        select: {
          id: true,
          downtimePointsBonus: true,
          missivePointsBonus: true,
        },
      });
      expect(prismaMock.character.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { downtimePoints: 5 },
      });
      expect(prismaMock.character.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { downtimePoints: 7 },
      });
    });
  });
});
