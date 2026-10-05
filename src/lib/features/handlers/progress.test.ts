import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DataCardinality,
  DataTypeAssignability,
  DataTypeKind,
  type PrismaClient,
} from "@prisma/client";
import { getFeatureHandler } from "../registry";
import { FT_PROGRESS } from "../featuresName";
import { SubFeatureDisabledError } from "./progress";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockAction,
  mockCampaign,
  mockCharacter,
  mockCharacterData,
  mockDataType,
  mockFeature,
  mockReferenceData,
} from "@/test/helpers/prisma-fixtures";

function stubPassthroughTransaction() {
  prismaMock.$transaction.mockImplementation((async (
    fn: (tx: PrismaClient) => Promise<unknown>
  ) => fn(prismaClient)) as never);
}

// Dispatcher (T-0xx, fusione talenti + recupero XP alla morte in
// "Progressione PG", Opzione B): un solo `functionName` eseguibile, un
// campo `kind` in `actionData` decide a quale sotto-handler delegare — le
// logiche di dominio vere e proprie restano testate in `talents.test.ts`/
// `deathXpRecovery.test.ts`, qui si verifica solo la registrazione, il
// discriminante e il gate `talentsEnabled`/`deathXpRecoveryEnabled`.
describe("progress handler (T-0xx)", () => {
  const handler = getFeatureHandler(FT_PROGRESS).handler;

  beforeEach(() => {
    vi.clearAllMocks();
    stubPassthroughTransaction();
  });

  it("is registered under progress with a discriminated actionSchema", () => {
    const definition = getFeatureHandler(FT_PROGRESS);
    expect(definition.featureName).toBe("Progressi");
    expect(
      definition.actionSchema.safeParse({ kind: "talent", referenceDataId: 10 })
        .success
    ).toBe(true);
    expect(
      definition.actionSchema.safeParse({
        kind: "deathXpRecovery",
        deceasedCharacterId: 10,
      }).success
    ).toBe(true);
    expect(definition.actionSchema.safeParse({ kind: "unknown" }).success).toBe(
      false
    );
    expect(definition.featureSchema.safeParse({}).success).toBe(true);
  });

  it("delegates to the talent handler when kind is 'talent' and talentsEnabled", async () => {
    const character = mockCharacter({ id: 1, campaignId: 1 });
    const feature = mockFeature({
      id: 5,
      campaignId: 1,
      featureData: { talentsEnabled: true },
    });
    const definition = {
      ...mockReferenceData({ id: 10, dataTypeId: 3, flags: { cost: 5 } }),
      dataType: mockDataType({
        id: 3,
        campaignId: 1,
        kind: DataTypeKind.talent,
        cardinality: DataCardinality.multi,
        assignability: DataTypeAssignability.always,
      }),
    };
    prismaMock.referenceData.findUnique.mockResolvedValue(definition);
    prismaMock.dataRequirement.findMany.mockResolvedValue([]);
    prismaMock.characterData.findMany.mockResolvedValue([]);
    prismaMock.xpTransaction.aggregate.mockResolvedValue({
      _sum: { amount: 100 },
    } as never);
    const action = mockAction({ id: 9, characterId: 1, featureId: 5 });
    prismaMock.action.create.mockResolvedValue(action);
    prismaMock.characterData.create.mockResolvedValue(
      mockCharacterData({
        id: 20,
        characterId: 1,
        referenceDataId: 10,
        actionId: 9,
      })
    );

    const result = await handler(prismaClient, {
      character,
      feature,
      actionData: { kind: "talent", referenceDataId: 10 },
      campaign: mockCampaign({ id: 1 }),
    });

    expect(result.action).toEqual(action);
  });

  it("rejects with SubFeatureDisabledError when kind is 'talent' but talentsEnabled is false, without touching the DB", async () => {
    const feature = mockFeature({
      id: 5,
      campaignId: 1,
      featureData: { talentsEnabled: false },
    });

    await expect(
      handler(prismaClient, {
        character: mockCharacter({ id: 1, campaignId: 1 }),
        feature,
        actionData: { kind: "talent", referenceDataId: 10 },
        campaign: mockCampaign({ id: 1 }),
      })
    ).rejects.toBeInstanceOf(SubFeatureDisabledError);
    expect(prismaMock.referenceData.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.action.create).not.toHaveBeenCalled();
  });

  it("delegates to the death-XP-recovery handler when kind is 'deathXpRecovery' and deathXpRecoveryEnabled", async () => {
    const deceased = mockCharacter({
      id: 10,
      campaignId: 1,
      deathDate: new Date("2026-07-01"),
    });
    const successor = mockCharacter({ id: 11, campaignId: 1 });
    const feature = mockFeature({
      id: 7,
      campaignId: 1,
      featureData: {
        deathXpRecoveryEnabled: true,
        deathXpRecoveryPercentage: 50,
      },
    });
    prismaMock.character.findUnique.mockResolvedValue(deceased);
    prismaMock.xpTransaction.aggregate.mockResolvedValue({
      _sum: { amount: 40 },
    } as never);
    const action = mockAction({ id: 12, characterId: 11, featureId: 7 });
    prismaMock.action.create.mockResolvedValue(action);
    prismaMock.xpTransaction.create.mockResolvedValue({
      id: 40,
      characterId: 11,
      amount: 20,
      reason: "deathRecovery",
      referenceDataId: null,
      actionId: null,
      sourceCharacterId: 10,
      updatedById: null,
      note: null,
      createdAt: new Date("2026-07-14"),
    } as never);

    const result = await handler(prismaClient, {
      character: successor,
      feature,
      actionData: { kind: "deathXpRecovery", deceasedCharacterId: 10 },
      campaign: mockCampaign({ id: 1 }),
    });

    expect(result.action).toEqual(action);
  });

  it("rejects with SubFeatureDisabledError when kind is 'deathXpRecovery' but deathXpRecoveryEnabled is false, without touching the DB", async () => {
    const feature = mockFeature({
      id: 7,
      campaignId: 1,
      featureData: { deathXpRecoveryEnabled: false },
    });

    await expect(
      handler(prismaClient, {
        character: mockCharacter({ id: 11, campaignId: 1 }),
        feature,
        actionData: { kind: "deathXpRecovery", deceasedCharacterId: 10 },
        campaign: mockCampaign({ id: 1 }),
      })
    ).rejects.toBeInstanceOf(SubFeatureDisabledError);
    expect(prismaMock.character.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.action.create).not.toHaveBeenCalled();
  });
});
