import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  handler,
  CharacterNotDeceasedError,
  DeceasedCharacterNotFoundError,
} from "./deathXpRecovery";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockAction,
  mockCampaign,
  mockCharacter,
  mockFeature,
} from "@/test/helpers/prisma-fixtures";

function stubPassthroughTransaction() {
  prismaMock.$transaction.mockImplementation((async (
    fn: (tx: PrismaClient) => Promise<unknown>
  ) => fn(prismaClient)) as never);
}

// Non passa più da `getFeatureHandler("deathXpRecovery")` (T-0xx, fusione
// in "Progressione PG", Opzione B): `deathXpRecovery` non registra più un
// proprio `functionName` — `handler` è esportato e chiamato direttamente
// qui, la logica di dispatch/gate (`kind`, `deathXpRecoveryEnabled`) è
// testata a parte in `progress.test.ts`.
describe("deathXpRecovery handler (T-019)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubPassthroughTransaction();
  });

  it("logs a done Action and credits the successor with the configured percentage of the deceased's available XP", async () => {
    const deceased = mockCharacter({
      id: 10,
      campaignId: 1,
      deathDate: new Date("2026-07-01"),
    });
    const successor = mockCharacter({ id: 11, campaignId: 1 });
    const feature = mockFeature({
      id: 7,
      campaignId: 1,
      featureData: { deathXpRecoveryPercentage: 50 },
    });
    prismaMock.character.findUnique.mockResolvedValue(deceased);
    // getXpBalance(deceased.id): earned = available = 40 (nessun acquisto).
    prismaMock.xpTransaction.aggregate.mockResolvedValue({
      _sum: { amount: 40 },
    } as never);

    const action = mockAction({
      id: 12,
      characterId: 11,
      featureId: 7,
    });
    prismaMock.action.create.mockResolvedValue(action);

    const xpTransaction = {
      id: 40,
      characterId: 11,
      amount: 20,
      reason: "deathRecovery" as const,
      referenceDataId: null,
      actionId: null,
      sourceCharacterId: 10,
      updatedById: null,
      note: null,
      createdAt: new Date("2026-07-14"),
    };
    prismaMock.xpTransaction.create.mockResolvedValue(xpTransaction);

    const result = await handler(prismaClient, {
      character: successor,
      feature,
      actionData: { deceasedCharacterId: 10 },
      campaign: mockCampaign({ id: 1 }),
    });

    expect(result).toEqual({ action, xpTransaction });
    expect(prismaMock.character.findUnique).toHaveBeenCalledWith({
      where: { id: 10, campaignId: 1 },
    });
    expect(prismaMock.action.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          characterId: 11,
          featureId: 7,
        }),
      })
    );
    expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith({
      data: {
        characterId: 11,
        amount: 20,
        reason: "deathRecovery",
        sourceCharacterId: 10,
      },
    });
  });

  it("logs the Action without crediting anything when the deceased has no available XP left", async () => {
    const deceased = mockCharacter({
      id: 10,
      campaignId: 1,
      deathDate: new Date("2026-07-01"),
    });
    const successor = mockCharacter({ id: 11, campaignId: 1 });
    const feature = mockFeature({
      id: 7,
      campaignId: 1,
      featureData: { deathXpRecoveryPercentage: 50 },
    });
    prismaMock.character.findUnique.mockResolvedValue(deceased);
    prismaMock.xpTransaction.aggregate.mockResolvedValue({
      _sum: { amount: 0 },
    } as never);
    prismaMock.action.create.mockResolvedValue(
      mockAction({
        id: 12,
        characterId: 11,
        featureId: 7,
      })
    );

    const result = await handler(prismaClient, {
      character: successor,
      feature,
      actionData: { deceasedCharacterId: 10 },
      campaign: mockCampaign({ id: 1 }),
    });

    expect(result.xpTransaction).toBeNull();
    expect(prismaMock.xpTransaction.create).not.toHaveBeenCalled();
  });

  it("rejects a deceasedCharacterId that does not resolve in the successor's campaign", async () => {
    prismaMock.character.findUnique.mockResolvedValue(null);

    await expect(
      handler(prismaClient, {
        character: mockCharacter({ id: 11, campaignId: 1 }),
        feature: mockFeature({ id: 7, campaignId: 1 }),
        actionData: { deceasedCharacterId: 999 },
        campaign: mockCampaign({ id: 1 }),
      })
    ).rejects.toBeInstanceOf(DeceasedCharacterNotFoundError);
    expect(prismaMock.action.create).not.toHaveBeenCalled();
  });

  it("rejects a character that is not actually deceased", async () => {
    prismaMock.character.findUnique.mockResolvedValue(
      mockCharacter({ id: 10, campaignId: 1, deathDate: null })
    );

    await expect(
      handler(prismaClient, {
        character: mockCharacter({ id: 11, campaignId: 1 }),
        feature: mockFeature({ id: 7, campaignId: 1 }),
        actionData: { deceasedCharacterId: 10 },
        campaign: mockCampaign({ id: 1 }),
      })
    ).rejects.toBeInstanceOf(CharacterNotDeceasedError);
    expect(prismaMock.action.create).not.toHaveBeenCalled();
  });
});
