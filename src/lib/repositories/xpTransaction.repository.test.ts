import { describe, it, expect, beforeEach, vi } from "vitest";
import { XpReason } from "@prisma/client";
import {
  createXpTransaction,
  findInitialGrant,
  getEarnedXpSum,
  getSettledXpSum,
  listXpTransactionsForCharacter,
} from "./xpTransaction.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import { mockXpTransaction } from "@/test/helpers/prisma-fixtures";

describe("XpTransaction Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createXpTransaction", () => {
    it("should insert a ledger row with the provided fields", async () => {
      const transaction = mockXpTransaction({
        amount: -5,
        reason: XpReason.purchase,
        referenceDataId: 2,
      });
      prismaMock.xpTransaction.create.mockResolvedValue(transaction);

      const result = await createXpTransaction(prismaClient, {
        characterId: 1,
        amount: -5,
        reason: XpReason.purchase,
        referenceDataId: 2,
      });

      expect(result).toEqual(transaction);
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          amount: -5,
          reason: XpReason.purchase,
          referenceDataId: 2,
        },
      });
    });
  });

  describe("findInitialGrant", () => {
    it("should look up the initialGrant row for the character", async () => {
      const transaction = mockXpTransaction({ reason: XpReason.initialGrant });
      prismaMock.xpTransaction.findFirst.mockResolvedValue(transaction);

      const result = await findInitialGrant(prismaClient, 1);

      expect(result).toEqual(transaction);
      expect(prismaMock.xpTransaction.findFirst).toHaveBeenCalledWith({
        where: { characterId: 1, reason: "initialGrant" },
      });
    });

    it("should return null when no grant exists yet", async () => {
      prismaMock.xpTransaction.findFirst.mockResolvedValue(null);

      const result = await findInitialGrant(prismaClient, 1);

      expect(result).toBeNull();
    });
  });

  describe("getSettledXpSum", () => {
    it("should sum all transactions for the character", async () => {
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 25 },
      } as never);

      const result = await getSettledXpSum(prismaClient, 1);

      expect(result).toBe(25);
      expect(prismaMock.xpTransaction.aggregate).toHaveBeenCalledWith({
        where: { characterId: 1 },
        _sum: { amount: true },
      });
    });

    it("should default to 0 when there are no transactions", async () => {
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: null },
      } as never);

      const result = await getSettledXpSum(prismaClient, 1);

      expect(result).toBe(0);
    });

    it("should not leak transactions from another character", async () => {
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);

      await getSettledXpSum(prismaClient, 2);

      expect(prismaMock.xpTransaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ characterId: 2 }),
        })
      );
    });
  });

  describe("getEarnedXpSum", () => {
    it("should sum only the positive-amount transactions for the character", async () => {
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 25 },
      } as never);

      const result = await getEarnedXpSum(prismaClient, 1);

      expect(result).toBe(25);
      expect(prismaMock.xpTransaction.aggregate).toHaveBeenCalledWith({
        where: { characterId: 1, amount: { gt: 0 } },
        _sum: { amount: true },
      });
    });

    it("should default to 0 when there are no positive transactions", async () => {
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: null },
      } as never);

      const result = await getEarnedXpSum(prismaClient, 1);

      expect(result).toBe(0);
    });
  });

  describe("listXpTransactionsForCharacter", () => {
    it("should list the ledger for the character, newest first", async () => {
      const transactions = [
        mockXpTransaction({ id: 2 }),
        mockXpTransaction({ id: 1 }),
      ];
      prismaMock.xpTransaction.findMany.mockResolvedValue(transactions);

      const result = await listXpTransactionsForCharacter(prismaClient, 1);

      expect(result).toEqual(transactions);
      expect(prismaMock.xpTransaction.findMany).toHaveBeenCalledWith({
        where: { characterId: 1 },
        orderBy: { createdAt: "desc" },
        include: {
          referenceData: { select: { name: true } },
          updatedBy: { select: { name: true } },
        },
      });
    });

    it("should cap the result with `take` when provided", async () => {
      prismaMock.xpTransaction.findMany.mockResolvedValue([]);

      await listXpTransactionsForCharacter(prismaClient, 1, 50);

      expect(prismaMock.xpTransaction.findMany).toHaveBeenCalledWith({
        where: { characterId: 1 },
        orderBy: { createdAt: "desc" },
        include: {
          referenceData: { select: { name: true } },
          updatedBy: { select: { name: true } },
        },
        take: 50,
      });
    });
  });
});
