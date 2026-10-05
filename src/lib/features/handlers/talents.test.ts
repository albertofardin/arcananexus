import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DataCardinality,
  DataTypeAssignability,
  DataTypeKind,
  DataVisibility,
  type PrismaClient,
} from "@prisma/client";
import {
  handler,
  NotATalentError,
  ReferenceDataNotFoundError,
} from "./talents";
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

// `$transaction` di default esegue davvero la callback passandole lo stesso
// client mockato — stesso pattern di `characterData.service.test.ts`.
function stubPassthroughTransaction() {
  prismaMock.$transaction.mockImplementation((async (
    fn: (tx: PrismaClient) => Promise<unknown>
  ) => fn(prismaClient)) as never);
}

// Non passa più da `getFeatureHandler("talents")` (T-0xx, fusione in
// "Progressione PG", Opzione B): `talents` non registra più un proprio
// `functionName` — `handler` è esportato e chiamato direttamente qui, la
// logica di dispatch/gate (`kind`, `talentsEnabled`) è testata a parte in
// `progress.test.ts`. `context.feature` è comunque sempre la `Feature`
// "progress" a runtime, ma questo modulo non lo sa né lo verifica.
describe("talents handler (T-019)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubPassthroughTransaction();
    // Nessun requisito/conflitto dichiarato per la voce sotto test.
    prismaMock.dataRequirement.findMany.mockResolvedValue([]);
    prismaMock.characterData.findMany.mockResolvedValue([]);
    // Saldo XP ampiamente sufficiente: non è il budget a essere sotto test
    // qui, solo la composizione Action + assegnazione + addebito.
    prismaMock.xpTransaction.aggregate.mockResolvedValue({
      _sum: { amount: 100 },
    } as never);
  });

  it("creates an Action, the CharacterData assignment and the linked XP debit", async () => {
    const character = mockCharacter({ id: 1, campaignId: 1 });
    const feature = mockFeature({ id: 5, campaignId: 1 });
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

    const action = mockAction({
      id: 9,
      characterId: 1,
      featureId: 5,
    });
    prismaMock.action.create.mockResolvedValue(action);

    const characterData = mockCharacterData({
      id: 20,
      characterId: 1,
      referenceDataId: 10,
      actionId: 9,
    });
    prismaMock.characterData.create.mockResolvedValue(characterData);

    const xpTransaction = {
      id: 30,
      characterId: 1,
      amount: -5,
      reason: "purchase" as const,
      referenceDataId: 10,
      actionId: 9,
      sourceCharacterId: null,
      updatedById: null,
      note: null,
      createdAt: new Date("2026-07-14"),
    };
    prismaMock.xpTransaction.create.mockResolvedValue(xpTransaction);

    const result = await handler(prismaClient, {
      character,
      feature,
      actionData: { referenceDataId: 10 },
      campaign: mockCampaign({ id: 1 }),
    });

    expect(result).toEqual({ action, characterData, xpTransaction });
    expect(prismaMock.referenceData.findUnique).toHaveBeenCalledWith({
      where: { id: 10, dataType: { campaignId: 1 } },
      include: { dataType: true },
    });
    expect(prismaMock.action.create).toHaveBeenCalledWith({
      data: {
        characterId: 1,
        featureId: 5,
        actionData: { referenceDataId: 10 },
        authorUserId: null,
      },
    });
    // L'assegnazione e l'addebito sono agganciati all'Action appena creata.
    expect(prismaMock.characterData.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actionId: 9 }),
      })
    );
    // T-038: l'esecuzione di un'azione feature assegna sempre `visible` (il
    // giocatore ha già dichiarato lui stesso l'azione).
    expect(prismaMock.characterData.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visibility: DataVisibility.visible }),
      })
    );
    expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actionId: 9 }),
      })
    );
  });

  it("rejects a referenceDataId that does not resolve in the character's campaign", async () => {
    prismaMock.referenceData.findUnique.mockResolvedValue(null);

    await expect(
      handler(prismaClient, {
        character: mockCharacter({ id: 1, campaignId: 1 }),
        feature: mockFeature({ id: 5, campaignId: 1 }),
        actionData: { referenceDataId: 999 },
        campaign: mockCampaign({ id: 1 }),
      })
    ).rejects.toBeInstanceOf(ReferenceDataNotFoundError);
    expect(prismaMock.action.create).not.toHaveBeenCalled();
  });

  it("rejects a reference data entry that is not a talent", async () => {
    const definition = {
      ...mockReferenceData({ id: 11, dataTypeId: 4 }),
      dataType: mockDataType({
        id: 4,
        campaignId: 1,
        kind: DataTypeKind.origins,
      }),
    };
    prismaMock.referenceData.findUnique.mockResolvedValue(definition);

    await expect(
      handler(prismaClient, {
        character: mockCharacter({ id: 1, campaignId: 1 }),
        feature: mockFeature({ id: 5, campaignId: 1 }),
        actionData: { referenceDataId: 11 },
        campaign: mockCampaign({ id: 1 }),
      })
    ).rejects.toBeInstanceOf(NotATalentError);
    expect(prismaMock.action.create).not.toHaveBeenCalled();
  });
});
