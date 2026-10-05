import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { getFeatureHandler } from "../registry";
import { FT_DOWNTIME } from "../featuresName";
// Importarlo (anche solo per i suoi export nominati) esegue già il
// side-effect `registerFeatureHandler` in coda al modulo.
import { InsufficientDowntimePointsError } from "../downtimePoints";
import "./downtimeAction";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockAction,
  mockCampaign,
  mockCharacter,
  mockFeature,
} from "@/test/helpers/prisma-fixtures";

// `$transaction` di default esegue davvero la callback passandole lo stesso
// client mockato — stesso pattern di `talents.test.ts`.
function stubPassthroughTransaction() {
  prismaMock.$transaction.mockImplementation((async (
    fn: (tx: PrismaClient) => Promise<unknown>
  ) => fn(prismaClient)) as never);
}

describe("downtime action handler (T-040 → T-0xx unificazione categorie)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubPassthroughTransaction();
  });

  it("registra un solo functionName FT_DOWNTIME, con category come campo dell'azione", () => {
    const definition = getFeatureHandler(FT_DOWNTIME);
    expect(definition.featureName).toBe("Downtime");
    expect(
      definition.actionSchema.safeParse({
        category: "Lavorare",
        subject: "Indagini in città",
        description: "Vado in cerca di indizi",
      }).success
    ).toBe(true);
    expect(
      definition.actionSchema.safeParse({
        subject: "Indagini in città",
        description: "Vado in cerca di indizi",
      }).success
    ).toBe(false);
    expect(definition.actionSchema.safeParse({}).success).toBe(false);
    expect(definition.featureSchema.safeParse({}).success).toBe(true);
  });

  it("scala 1 punto downtime e crea l'Action sulla Feature contenitore, con status waiting", async () => {
    const definition = getFeatureHandler(FT_DOWNTIME);
    const character = mockCharacter({
      id: 1,
      campaignId: 1,
      downtimePoints: 3,
    });
    const feature = mockFeature({
      id: 7,
      campaignId: 1,
      featureData: { maxPoints: 10, notifyUserIds: [], categories: [] },
    });
    const action = mockAction({
      id: 42,
      characterId: 1,
      featureId: 7,
      actionData: {
        category: "Lavorare",
        subject: "Indagini in città",
        description: "Vado in cerca di indizi",
      },
    });
    prismaMock.action.create.mockResolvedValue(action);

    const result = await definition.handler(prismaClient, {
      character,
      feature,
      actionData: {
        category: "Lavorare",
        subject: "Indagini in città",
        description: "Vado in cerca di indizi",
      },
      campaign: mockCampaign({ id: 1 }),
    });

    expect(result).toEqual({ action });
    expect(prismaMock.character.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { downtimePoints: { increment: -1 } },
    });
    expect(prismaMock.action.create).toHaveBeenCalledWith({
      data: {
        characterId: 1,
        featureId: 7,
        actionData: {
          category: "Lavorare",
          subject: "Indagini in città",
          description: "Vado in cerca di indizi",
          status: "waiting",
        },
        // Nessun `masterUserId` propagato qui: l'handler downtime scala
        // sempre da un `Character` reale, non "a nome del master".
        authorUserId: null,
      },
    });
  });

  it("notifica gli utenti configurati in featureData.notifyUserIds della Feature contenitore passata (T-0xx: nessun lookup separato, feature È già il contenitore)", async () => {
    const definition = getFeatureHandler(FT_DOWNTIME);
    const character = mockCharacter({
      id: 1,
      campaignId: 1,
      downtimePoints: 3,
    });
    const feature = mockFeature({
      id: 99,
      campaignId: 1,
      featureData: {
        maxPoints: 10,
        notifyUserIds: ["master-1", "master-2"],
        categories: ["Indagare"],
      },
    });
    const action = mockAction({
      id: 42,
      characterId: 1,
      featureId: 99,
      actionData: {
        category: "Indagare",
        subject: "Indagini",
        description: "...",
      },
    });
    prismaMock.action.create.mockResolvedValue(action);

    await definition.handler(prismaClient, {
      character,
      feature,
      actionData: {
        category: "Indagare",
        subject: "Indagini",
        description: "...",
      },
      campaign: mockCampaign({ id: 1 }),
    });

    expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
      data: [
        { userId: "master-1", campaignId: 1, type: "downtime", entityId: 42 },
        { userId: "master-2", campaignId: 1, type: "downtime", entityId: 42 },
      ],
    });
  });

  it("rifiuta con InsufficientDowntimePointsError quando il personaggio non ha punti downtime, senza creare l'Action", async () => {
    const definition = getFeatureHandler(FT_DOWNTIME);
    const character = mockCharacter({
      id: 1,
      campaignId: 1,
      downtimePoints: 0,
    });
    const feature = mockFeature({
      id: 7,
      campaignId: 1,
      featureData: { maxPoints: 10, notifyUserIds: [], categories: [] },
    });

    await expect(
      definition.handler(prismaClient, {
        character,
        feature,
        actionData: {
          category: "Lavorare",
          subject: "Lavoro",
          description: "Vado a lavorare",
        },
        campaign: mockCampaign({ id: 1 }),
      })
    ).rejects.toBeInstanceOf(InsufficientDowntimePointsError);
    expect(prismaMock.action.create).not.toHaveBeenCalled();
  });
});
