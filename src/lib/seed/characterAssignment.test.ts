import { describe, it, expect, beforeEach, vi } from "vitest";
import { XpReason } from "@prisma/client";
import {
  assignCharacterData,
  assignRaceWithInitialXp,
  purchaseTalent,
} from "./characterAssignment";
import {
  RACE_STARTING_PX,
  TALENT_COSTS,
  DEMO_CHARACTER_EXPECTED_XP_BALANCE,
} from "./demoCampaignPlan";
import { getXpBalance, InsufficientXpError } from "@/lib/services/xp.service";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockCharacterData,
  mockXpTransaction,
} from "@/test/helpers/prisma-fixtures";

describe("seed character assignment helpers (T-023 stand-in for T-017)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("assignRaceWithInitialXp", () => {
    it("should create the CharacterData row and grant the race's startingPx", async () => {
      prismaMock.characterData.findFirst.mockResolvedValue(null);
      const characterData = mockCharacterData({
        characterId: 1,
        referenceDataId: 2,
        dataTypeId: 3,
      });
      prismaMock.characterData.create.mockResolvedValue(characterData);
      prismaMock.xpTransaction.findFirst.mockResolvedValue(null);
      prismaMock.xpTransaction.create.mockResolvedValue(
        mockXpTransaction({ amount: 20, reason: XpReason.initialGrant })
      );

      const result = await assignRaceWithInitialXp(
        prismaClient,
        { id: 1 },
        { id: 2, dataTypeId: 3, flags: { startingPx: 20 } }
      );

      expect(result).toEqual(characterData);
      expect(prismaMock.characterData.create).toHaveBeenCalledWith({
        data: { characterId: 1, referenceDataId: 2, dataTypeId: 3 },
      });
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          amount: 20,
          reason: XpReason.initialGrant,
          referenceDataId: 2,
        },
      });
    });

    it("should be idempotent: a second run returns the existing assignment without touching the ledger", async () => {
      const existing = mockCharacterData({
        characterId: 1,
        referenceDataId: 2,
      });
      prismaMock.characterData.findFirst.mockResolvedValue(existing);

      const result = await assignRaceWithInitialXp(
        prismaClient,
        { id: 1 },
        { id: 2, dataTypeId: 3, flags: { startingPx: 20 } }
      );

      expect(result).toEqual(existing);
      expect(prismaMock.characterData.create).not.toHaveBeenCalled();
      expect(prismaMock.xpTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe("assignCharacterData", () => {
    it("should assign a reference data with no XP involved (e.g. a religion)", async () => {
      prismaMock.characterData.findFirst.mockResolvedValue(null);
      const characterData = mockCharacterData({
        characterId: 1,
        referenceDataId: 7,
        dataTypeId: 4,
      });
      prismaMock.characterData.create.mockResolvedValue(characterData);

      const result = await assignCharacterData(
        prismaClient,
        { id: 1 },
        { id: 7, dataTypeId: 4 }
      );

      expect(result).toEqual(characterData);
      expect(prismaMock.xpTransaction.create).not.toHaveBeenCalled();
    });

    it("should be idempotent per (characterId, referenceDataId)", async () => {
      const existing = mockCharacterData({
        characterId: 1,
        referenceDataId: 7,
      });
      prismaMock.characterData.findFirst.mockResolvedValue(existing);

      const result = await assignCharacterData(
        prismaClient,
        { id: 1 },
        { id: 7, dataTypeId: 4 }
      );

      expect(result).toEqual(existing);
      expect(prismaMock.characterData.create).not.toHaveBeenCalled();
    });
  });

  describe("purchaseTalent", () => {
    it("should debit the cost and create the CharacterData when the budget is sufficient", async () => {
      prismaMock.characterData.findFirst.mockResolvedValue(null);
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 20 },
      } as never);
      prismaMock.xpTransaction.create.mockResolvedValue(
        mockXpTransaction({ amount: -5, reason: XpReason.purchase })
      );
      const characterData = mockCharacterData({
        characterId: 1,
        referenceDataId: 10,
        dataTypeId: 5,
      });
      prismaMock.characterData.create.mockResolvedValue(characterData);

      const result = await purchaseTalent(
        prismaClient,
        { id: 1 },
        { id: 10, dataTypeId: 5, flags: { cost: 5 } }
      );

      expect(result).toEqual(characterData);
      expect(prismaMock.characterData.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          referenceDataId: 10,
          dataTypeId: 5,
          grantedByOverride: false,
          grantedById: null,
        },
      });
    });

    it("should reject an insufficient-budget purchase without the override flag", async () => {
      prismaMock.characterData.findFirst.mockResolvedValue(null);
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 2 },
      } as never);

      await expect(
        purchaseTalent(
          prismaClient,
          { id: 1 },
          { id: 10, dataTypeId: 5, flags: { cost: 15 } }
        )
      ).rejects.toBeInstanceOf(InsufficientXpError);
      expect(prismaMock.characterData.create).not.toHaveBeenCalled();
    });

    it("should allow a master override to go through even under insufficient budget, marking grantedByOverride/grantedById", async () => {
      prismaMock.characterData.findFirst.mockResolvedValue(null);
      // Nessuna lettura di saldo: `debitTalent` la salta quando
      // `allowOverride: true`.
      prismaMock.xpTransaction.create.mockResolvedValue(
        mockXpTransaction({ amount: -15, reason: XpReason.purchase })
      );
      const characterData = mockCharacterData({
        characterId: 1,
        referenceDataId: 11,
        dataTypeId: 5,
        grantedByOverride: true,
        grantedById: "master-1",
      });
      prismaMock.characterData.create.mockResolvedValue(characterData);

      const result = await purchaseTalent(
        prismaClient,
        { id: 1 },
        { id: 11, dataTypeId: 5, flags: { cost: 15 } },
        { grantedByOverride: true, grantedById: "master-1" }
      );

      expect(result).toEqual(characterData);
      expect(prismaMock.xpTransaction.aggregate).not.toHaveBeenCalled();
      expect(prismaMock.characterData.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          referenceDataId: 11,
          dataTypeId: 5,
          grantedByOverride: true,
          grantedById: "master-1",
        },
      });
    });

    it("should be idempotent: a second run skips both the ledger debit and the assignment", async () => {
      const existing = mockCharacterData({
        characterId: 1,
        referenceDataId: 10,
      });
      prismaMock.characterData.findFirst.mockResolvedValue(existing);

      const result = await purchaseTalent(
        prismaClient,
        { id: 1 },
        { id: 10, dataTypeId: 5, flags: { cost: 5 } }
      );

      expect(result).toEqual(existing);
      expect(prismaMock.xpTransaction.create).not.toHaveBeenCalled();
      expect(prismaMock.characterData.create).not.toHaveBeenCalled();
    });
  });

  // Riproduce per intero lo scenario XP del PG demo di `prisma/seed.ts`
  // (T-023: razza Umano + tre acquisti normali + un acquisto in deroga del
  // master) usando le stesse costanti di `demoCampaignPlan.ts`, sul ledger
  // reale (`getXpBalance`, T-025) invece che su un calcolo a parte: se i
  // numeri del piano o la logica del ledger cambiano senza restare coerenti,
  // questo test si rompe.
  describe("scenario del PG demo (saldo XP finale coerente)", () => {
    it("computes the expected final balance across a race grant and four talent purchases (one in override)", async () => {
      const characterId = 42;
      const ledger: number[] = [];

      prismaMock.characterData.findFirst.mockResolvedValue(null);
      prismaMock.characterData.create.mockResolvedValue(mockCharacterData());
      prismaMock.xpTransaction.findFirst.mockResolvedValue(null);
      prismaMock.xpTransaction.create.mockImplementation((async (args: {
        data: { amount: number };
      }) => {
        ledger.push(args.data.amount);
        return mockXpTransaction({ amount: args.data.amount });
      }) as never);
      // `getXpBalance` interroga `aggregate` una volta per chiamata (somma
      // di tutte le transazioni del personaggio): la deriviamo dal ledger
      // accumulato finora.
      prismaMock.xpTransaction.aggregate.mockImplementation((async () => {
        return {
          _sum: { amount: ledger.reduce((sum, amount) => sum + amount, 0) },
        };
      }) as never);

      await assignRaceWithInitialXp(
        prismaClient,
        { id: characterId },
        { id: 1, dataTypeId: 1, flags: { startingPx: RACE_STARTING_PX.umano } }
      );
      await purchaseTalent(
        prismaClient,
        { id: characterId },
        { id: 2, dataTypeId: 2, flags: { cost: TALENT_COSTS.lamaDelVeterano } }
      );
      await purchaseTalent(
        prismaClient,
        { id: characterId },
        {
          id: 3,
          dataTypeId: 2,
          flags: { cost: TALENT_COSTS.fendenteImplacabile },
        }
      );
      await purchaseTalent(
        prismaClient,
        { id: characterId },
        {
          id: 4,
          dataTypeId: 2,
          flags: { cost: TALENT_COSTS.codiceDegliIniziati },
        }
      );
      await purchaseTalent(
        prismaClient,
        { id: characterId },
        {
          id: 5,
          dataTypeId: 2,
          flags: { cost: TALENT_COSTS.donoProibitoDelSangueNero },
        },
        { grantedByOverride: true, grantedById: "master-1" }
      );

      const finalSum = ledger.reduce((sum, amount) => sum + amount, 0);
      expect(finalSum).toBe(DEMO_CHARACTER_EXPECTED_XP_BALANCE);

      const { available } = await getXpBalance(prismaClient, characterId);
      expect(available).toBe(DEMO_CHARACTER_EXPECTED_XP_BALANCE);
    });
  });
});
