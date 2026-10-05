import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import {
  DataCardinality,
  DataTypeAssignability,
  DataTypeKind,
} from "@prisma/client";
import { POST } from "../route";
import {
  mockCampaign,
  mockCharacter,
  mockDataType,
  mockFeature,
  mockFeatureType,
  mockReferenceData,
} from "@/test/helpers/prisma-fixtures";
// `vi.mock` è hoisted sopra gli import: questi import risolvono sempre ai
// moduli mockati sotto, a prescindere dall'ordine nel file sorgente.
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    campaign: { findFirst: vi.fn() },
    character: { findUnique: vi.fn(), update: vi.fn() },
    grant: { findUnique: vi.fn() },
    feature: { findFirst: vi.fn() },
    referenceData: { findUnique: vi.fn() },
    dataRequirement: { findMany: vi.fn() },
    characterData: { findMany: vi.fn(), create: vi.fn() },
    xpTransaction: { aggregate: vi.fn(), create: vi.fn() },
    action: { create: vi.fn() },
    // T-0xx, notifica missiva: creata dentro la stessa transazione
    // dell'handler, dopo la risoluzione del destinatario.
    notification: { create: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const buildParams = (campaignSlug: string, characterId: string) => ({
  params: Promise.resolve({ campaignSlug, characterId }),
});

function buildRequest(body: unknown) {
  return new NextRequest(
    "http://localhost/api/campaigns/campaign-a/characters/1/actions",
    { method: "POST", body: JSON.stringify(body) }
  );
}

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
};
const campaignB = {
  ...mockCampaign({ id: 2, slug: "campaign-b" }),
  organization: { slug: "arcana-domine" },
};

const owner = { id: "user-owner", email: "owner@example.com" };
const master = { id: "user-master", email: "master@example.com" };
const stranger = { id: "user-stranger", email: "stranger@example.com" };

const playerCharacter = mockCharacter({
  id: 1,
  campaignId: 1,
  userId: owner.id,
});

const talentDataType = mockDataType({
  id: 3,
  campaignId: 1,
  kind: DataTypeKind.talent,
  cardinality: DataCardinality.multi,
  assignability: DataTypeAssignability.always,
});

const talentDefinition = {
  ...mockReferenceData({ id: 10, dataTypeId: 3, flags: { cost: 5 } }),
  dataType: talentDataType,
};

// T-035 (round 2, finding minore reviewer): `cardinality: null` (vincolo
// strutturale, `NotAssignableDataTypeError`) — difensivo, dato che oggi
// nessun `DataType` `kind: talent` dovrebbe avere `cardinality: null` (lo
// impedisce l'invariante di `validations/dataType.ts`), ma il servizio T-017
// lo rifiuta comunque esplicitamente prima di qualunque gate `isMaster`.
const notAssignableTalentDataType = mockDataType({
  id: 4,
  campaignId: 1,
  kind: DataTypeKind.talent,
  cardinality: null,
  assignability: DataTypeAssignability.masterOnly,
});
const notAssignableTalentDefinition = {
  ...mockReferenceData({ id: 11, dataTypeId: 4, flags: { cost: 0 } }),
  dataType: notAssignableTalentDataType,
};

// `talents` non ha più una propria `Feature` (T-0xx, fusione in
// "Progressione PG"): la route risolve `FT_PROGRESS` al suo posto e
// legge `talentsEnabled` da `featureData` — questa fixture rappresenta
// quella `Feature` contenitore, non una dedicata a "talents".
const talentsFeature = {
  ...mockFeature({ id: 5, campaignId: 1 }),
  featureData: { talentsEnabled: true },
  featureType: mockFeatureType({
    id: 1,
    featureName: "Progressi",
    functionName: "progress",
  }),
};

// `$transaction` di default esegue davvero la callback passandole lo stesso
// client mockato — stesso pattern usato da `talents.test.ts` e da
// `characters/route.test.ts`.
function stubPassthroughTransaction() {
  (prisma.$transaction as unknown as Mock).mockImplementation(
    (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)
  );
}

describe("POST /api/campaigns/[campaignSlug]/characters/[characterId]/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubPassthroughTransaction();
  });

  it("returns 401 when there is no session", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest({ functionName: "talents", actionData: {} }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for a malformed body (missing functionName)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: owner,
    });

    const response = await POST(
      buildRequest({ actionData: {} }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when the campaign does not exist", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: owner,
    });
    (prisma.campaign.findFirst as unknown as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest({ functionName: "talents", actionData: {} }),
      buildParams("unknown-campaign", "1")
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the character does not belong to the resolved campaign (multi-tenant scoping)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: owner,
    });
    (prisma.campaign.findFirst as unknown as Mock).mockResolvedValue(campaignA);
    (prisma.character.findUnique as unknown as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest({ functionName: "talents", actionData: {} }),
      buildParams("campaign-a", "999")
    );

    expect(response.status).toBe(404);
    expect(prisma.character.findUnique).toHaveBeenCalledWith({
      where: { id: 999, campaignId: campaignA.id },
    });
  });

  it("returns 403 when a player tries to act on a character they do not own", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: stranger,
    });
    (prisma.campaign.findFirst as unknown as Mock).mockResolvedValue(campaignA);
    (prisma.character.findUnique as unknown as Mock).mockResolvedValue(
      playerCharacter
    );
    (prisma.grant.findUnique as unknown as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest({ functionName: "talents", actionData: {} }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 when the functionName has no active Feature in this campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: owner,
    });
    (prisma.campaign.findFirst as unknown as Mock).mockResolvedValue(campaignA);
    (prisma.character.findUnique as unknown as Mock).mockResolvedValue(
      playerCharacter
    );
    (prisma.grant.findUnique as unknown as Mock).mockResolvedValue(null);
    (prisma.feature.findFirst as unknown as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest({ functionName: "talents", actionData: {} }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(404);
  });

  describe("talents, executed by the owner", () => {
    beforeEach(() => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: owner,
      });
      (prisma.campaign.findFirst as unknown as Mock).mockResolvedValue(
        campaignA
      );
      (prisma.character.findUnique as unknown as Mock).mockResolvedValue(
        playerCharacter
      );
      (prisma.grant.findUnique as unknown as Mock).mockResolvedValue(null);
      (prisma.feature.findFirst as unknown as Mock).mockResolvedValue(
        talentsFeature
      );
      (prisma.referenceData.findUnique as unknown as Mock).mockResolvedValue(
        talentDefinition
      );
      (prisma.dataRequirement.findMany as unknown as Mock).mockResolvedValue(
        []
      );
      (prisma.characterData.findMany as unknown as Mock).mockResolvedValue([]);
    });

    // `talentDefinition.flags` non dichiara `creationOnly` (assente ⇒
    // `false`) — irrilevante qui: `talents` non passa mai
    // `isCreation` (sempre `false` di default), quindi resta il percorso di
    // apprendimento talenti disponibile dopo la creazione del PG, a
    // prescindere da `creationOnly`.
    it("creates an Action with the linked CharacterData + XP debit when the player has enough XP", async () => {
      (prisma.xpTransaction.aggregate as unknown as Mock).mockResolvedValue({
        _sum: { amount: 100 },
      });
      const createdAction = {
        id: 42,
        characterId: 1,
        featureId: 5,
        actionData: { kind: "talent", referenceDataId: 10 },
      };
      (prisma.action.create as unknown as Mock).mockResolvedValue(
        createdAction
      );
      const createdCharacterData = {
        id: 100,
        characterId: 1,
        referenceDataId: 10,
        actionId: 42,
      };
      (prisma.characterData.create as unknown as Mock).mockResolvedValue(
        createdCharacterData
      );
      const createdXpTransaction = {
        id: 200,
        characterId: 1,
        amount: -5,
        actionId: 42,
      };
      (prisma.xpTransaction.create as unknown as Mock).mockResolvedValue(
        createdXpTransaction
      );

      const response = await POST(
        buildRequest({
          functionName: "progress",
          actionData: { kind: "talent", referenceDataId: 10 },
        }),
        buildParams("campaign-a", "1")
      );

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.characterData).toEqual(createdCharacterData);
      expect(body.xpTransaction).toEqual(createdXpTransaction);
    });

    // `assignReferenceDataToCharacter` (T-017) valuta il saldo XP dentro
    // `evaluateRequirements` *prima* di arrivare a `debitTalent`: per il
    // self-assign (questo handler non passa mai `isMaster`, vedi commento
    // nella route) l'XP insufficiente emerge quindi come
    // `RequirementsNotSatisfiedError` (xpSufficient: false dentro
    // l'`evaluation`), non come `InsufficientXpError` diretto — entrambi
    // sono comunque mappati dalla route su un 422 leggibile, mai un 500.
    it("returns a readable 422 (not a 500) when the player does not have enough XP", async () => {
      (prisma.xpTransaction.aggregate as unknown as Mock).mockResolvedValue({
        _sum: { amount: 1 },
      });

      const response = await POST(
        buildRequest({
          functionName: "progress",
          actionData: { kind: "talent", referenceDataId: 10 },
        }),
        buildParams("campaign-a", "1")
      );

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.error).toMatch(/requisiti/i);
      expect(body.details).toMatchObject({
        xpCost: 5,
        xpSufficient: false,
        satisfied: false,
      });
    });

    // T-035 (round 2, finding minore reviewer): `cardinality: null` è un
    // vincolo strutturale (`NotAssignableDataTypeError`), mappato su 422 —
    // mai un 403/500 — anche su questo percorso di esecuzione azione, non
    // solo sulla creazione PG (già coperto in `characters/__tests__/route.test.ts`).
    it("returns a readable 422 (not a 500) when the chosen talent's DataType has cardinality: null", async () => {
      (prisma.referenceData.findUnique as unknown as Mock).mockResolvedValue(
        notAssignableTalentDefinition
      );
      (prisma.xpTransaction.aggregate as unknown as Mock).mockResolvedValue({
        _sum: { amount: 100 },
      });
      // `assignReferenceDataToCharacter` è chiamata *dopo* la creazione
      // dell'`Action` (entrambe dentro la stessa transazione, vedi
      // `talents.ts`): serve un `Action` valido perché il rifiuto
      // strutturale (`NotAssignableDataTypeError`) emerga dal punto giusto,
      // non da un `undefined.id` accidentale sul mock di default.
      (prisma.action.create as unknown as Mock).mockResolvedValue({
        id: 43,
        characterId: 1,
        featureId: 5,
        actionData: { kind: "talent", referenceDataId: 11 },
      });

      const response = await POST(
        buildRequest({
          functionName: "progress",
          actionData: { kind: "talent", referenceDataId: 11 },
        }),
        buildParams("campaign-a", "1")
      );

      expect(response.status).toBe(422);
      expect(prisma.characterData.create).not.toHaveBeenCalled();
    });

    it("returns 400 with the Zod issues when actionData does not match the handler's schema", async () => {
      const response = await POST(
        buildRequest({
          functionName: "progress",
          actionData: { kind: "talent" },
        }),
        buildParams("campaign-a", "1")
      );

      expect(response.status).toBe(400);
      expect(prisma.action.create).not.toHaveBeenCalled();
    });
  });

  it("lets a campaign master act on behalf of another player's character", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: master,
    });
    (prisma.campaign.findFirst as unknown as Mock).mockResolvedValue(campaignA);
    (prisma.character.findUnique as unknown as Mock).mockResolvedValue(
      playerCharacter
    );
    (prisma.grant.findUnique as unknown as Mock).mockResolvedValue({
      userId: master.id,
      campaignId: 1,
      role: "master",
    });
    (prisma.feature.findFirst as unknown as Mock).mockResolvedValue(
      talentsFeature
    );
    (prisma.referenceData.findUnique as unknown as Mock).mockResolvedValue(
      talentDefinition
    );
    (prisma.dataRequirement.findMany as unknown as Mock).mockResolvedValue([]);
    (prisma.characterData.findMany as unknown as Mock).mockResolvedValue([]);
    (prisma.xpTransaction.aggregate as unknown as Mock).mockResolvedValue({
      _sum: { amount: 100 },
    });
    (prisma.action.create as unknown as Mock).mockResolvedValue({
      id: 42,
    });
    (prisma.characterData.create as unknown as Mock).mockResolvedValue({
      id: 100,
    });
    (prisma.xpTransaction.create as unknown as Mock).mockResolvedValue({
      id: 200,
    });

    const response = await POST(
      buildRequest({
        functionName: "progress",
        actionData: { kind: "talent", referenceDataId: 10 },
      }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(201);
  });

  // Decisione B (T-0xx): il master bypassa SEMPRE il gate missivePoints,
  // anche inviando dal PG di un altro giocatore, a differenza degli altri
  // handler (`talents` sopra non riceve alcun bypass).
  it("lets a campaign master send a missive bypassing missivePoints, even at zero balance", async () => {
    const missiveFeature = {
      ...mockFeature({ id: 6, campaignId: 1, featureData: {} }),
      featureType: mockFeatureType({
        id: 2,
        featureName: "Missive",
        functionName: "missive",
      }),
    };
    const exhaustedCharacter = mockCharacter({
      id: 1,
      campaignId: 1,
      userId: owner.id,
      missivePoints: 0,
      downtimePoints: 0,
    });

    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: master,
    });
    (prisma.campaign.findFirst as unknown as Mock).mockResolvedValue(campaignA);
    (prisma.character.findUnique as unknown as Mock).mockResolvedValue(
      exhaustedCharacter
    );
    (prisma.grant.findUnique as unknown as Mock).mockResolvedValue({
      userId: master.id,
      campaignId: 1,
      role: "master",
    });
    (prisma.feature.findFirst as unknown as Mock).mockResolvedValue(
      missiveFeature
    );
    (prisma.action.create as unknown as Mock).mockResolvedValue({
      id: 55,
      characterId: 1,
    });

    const response = await POST(
      buildRequest({
        functionName: "missive",
        actionData: {
          description: "Ciao",
          subject: "Oggetto",
          receiverCharacterId: 3,
        },
      }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(201);
    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it("does not leak a character belonging to another campaign (404, not 403)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: owner,
    });
    (prisma.campaign.findFirst as unknown as Mock).mockResolvedValue(campaignB);
    // Il repository scopa la query su `campaignId`: un personaggio di
    // un'altra campagna non viene mai restituito.
    (prisma.character.findUnique as unknown as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest({
        functionName: "progress",
        actionData: { kind: "talent" },
      }),
      buildParams("campaign-b", "1")
    );

    expect(response.status).toBe(404);
  });
});
