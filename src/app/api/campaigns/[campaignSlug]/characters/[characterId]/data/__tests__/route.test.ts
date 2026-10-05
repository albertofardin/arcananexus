import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import {
  DataCardinality,
  DataTypeAssignability,
  DataVisibility,
  Role,
} from "@prisma/client";
import { POST } from "../route";
import {
  mockCampaign,
  mockCharacter,
  mockCharacterData,
  mockDataType,
  mockReferenceData,
} from "@/test/helpers/prisma-fixtures";
// `vi.mock` è hoisted sopra gli import: questi import risolvono sempre ai
// moduli mockati sotto.
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    campaign: { findFirst: vi.fn() },
    grant: { findUnique: vi.fn() },
    character: { findUnique: vi.fn() },
    referenceData: { findUnique: vi.fn() },
    dataRequirement: { findMany: vi.fn() },
    characterData: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    xpTransaction: { aggregate: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const buildParams = (campaignSlug: string, characterId: string) => ({
  params: Promise.resolve({ campaignSlug, characterId }),
});

function buildRequest(body: unknown) {
  return new NextRequest(
    "http://localhost/api/campaigns/campaign-a/characters/1/data",
    { method: "POST", body: JSON.stringify(body) }
  );
}

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
};

// Cardinalità singola, `flags: null` (nessun costo XP: salta interamente il
// percorso di addebito talenti) — stessa scorciatoia già usata da
// `characterData.service.test.ts` per isolare la sola logica di visibilità
// dal resto (requisiti/XP), qui riusata per non duplicare quella copertura.
function buildDefinition(overrides: {
  referenceData?: Partial<ReturnType<typeof mockReferenceData>>;
  dataType?: Parameters<typeof mockDataType>[0];
}) {
  return {
    ...mockReferenceData({
      id: 100,
      dataTypeId: 10,
      ...overrides.referenceData,
    }),
    dataType: mockDataType({
      id: 10,
      campaignId: 1,
      cardinality: DataCardinality.single,
      assignability: DataTypeAssignability.always,
      visibility: DataVisibility.visible,
      ...overrides.dataType,
    }),
  };
}

// Nomi utente diversi per scenario: `isUserCampaignMaster`/`getCampaignBySlug`
// sono avvolti in `cache()` (React, dedup per-request) — nella stessa
// esecuzione dei test la cache sopravvive a `vi.clearAllMocks()` perché vive
// fuori dallo stato dei mock. Finché campagna/slug restano invariati (qui
// sempre "campaign-a") e ogni scenario di ruolo usa un `userId` diverso, le
// chiavi di cache non si scontrano mai fra i test — stesso accorgimento già
// in uso in `missive/__tests__/route.test.ts`.
function asMaster(userId = "user-master") {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: userId, email: `${userId}@example.com` },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue({
    userId,
    campaignId: 1,
    role: Role.master,
  });
}

function asPlayer(userId: string) {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: userId, email: `${userId}@example.com` },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue(null);
}

describe("POST /api/campaigns/[campaignSlug]/characters/[characterId]/data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    // Requisiti/XP vuoti: `evaluateRequirements` risulta sempre soddisfatta,
    // così ogni test si concentra solo sulla visibilità dell'assegnazione.
    (prisma.dataRequirement.findMany as Mock).mockResolvedValue([]);
    (prisma.characterData.findMany as Mock).mockResolvedValue([]);
    (prisma.xpTransaction.aggregate as Mock).mockResolvedValue({
      _sum: { amount: 0 },
    });
    (prisma.$transaction as Mock).mockImplementation(fn => fn(prisma));
    (prisma.characterData.deleteMany as Mock).mockResolvedValue({ count: 0 });
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest({ referenceDataId: 100 }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid body (missing referenceDataId)", async () => {
    asMaster("user-master-1");

    const response = await POST(
      buildRequest({}),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for an unknown visibility value in the body", async () => {
    asMaster("user-master-2");

    const response = await POST(
      buildRequest({ referenceDataId: 100, visibility: "public" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when the campaign does not exist", async () => {
    asMaster("user-master-3");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest({ referenceDataId: 100 }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the character does not belong to this campaign", async () => {
    asMaster("user-master-4");
    (prisma.character.findUnique as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest({ referenceDataId: 100 }),
      buildParams("campaign-a", "999")
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 when a non-owner, non-master player tries to assign to someone else's character", async () => {
    asPlayer("user-other-player");
    (prisma.character.findUnique as Mock).mockResolvedValue(
      mockCharacter({ id: 1, campaignId: 1, userId: "user-owner" })
    );

    const response = await POST(
      buildRequest({ referenceDataId: 100 }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(403);
    expect(prisma.characterData.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the ReferenceData does not belong to this campaign", async () => {
    asMaster("user-master-5");
    (prisma.character.findUnique as Mock).mockResolvedValue(
      mockCharacter({ id: 1, campaignId: 1 })
    );
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest({ referenceDataId: 100 }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(404);
  });

  // T-0xx: il self-assign del giocatore assegna sempre `visible`, non
  // negoziabile (T-038) — anche se (erroneamente) inviasse un `visibility`
  // esplicito, e a prescindere dal default `DataType.visibility`.
  it("player self-assign always creates the entry as visible, ignoring both an explicit visibility and a hidden DataType default", async () => {
    asPlayer("user-owner-1");
    (prisma.character.findUnique as Mock).mockResolvedValue(
      mockCharacter({ id: 1, campaignId: 1, userId: "user-owner-1" })
    );
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(
      buildDefinition({ dataType: { visibility: DataVisibility.hidden } })
    );
    (prisma.characterData.create as Mock).mockResolvedValue(
      mockCharacterData({ id: 1, characterId: 1, referenceDataId: 100 })
    );

    const response = await POST(
      buildRequest({ referenceDataId: 100, visibility: "hidden" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(201);
    expect(prisma.characterData.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visibility: DataVisibility.visible }),
      })
    );
  });

  it("a master concession without an explicit visibility inherits DataType.visibility = hidden", async () => {
    asMaster("user-master-6");
    (prisma.character.findUnique as Mock).mockResolvedValue(
      mockCharacter({ id: 1, campaignId: 1, userId: "some-player" })
    );
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(
      buildDefinition({ dataType: { visibility: DataVisibility.hidden } })
    );
    (prisma.characterData.create as Mock).mockResolvedValue(
      mockCharacterData({ id: 2, characterId: 1, referenceDataId: 100 })
    );

    const response = await POST(
      buildRequest({ referenceDataId: 100 }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(201);
    expect(prisma.characterData.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visibility: DataVisibility.hidden }),
      })
    );
  });

  it("a master concession's explicit visibility overrides a hidden DataType default", async () => {
    asMaster("user-master-7");
    (prisma.character.findUnique as Mock).mockResolvedValue(
      mockCharacter({ id: 1, campaignId: 1, userId: "some-player" })
    );
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(
      buildDefinition({ dataType: { visibility: DataVisibility.hidden } })
    );
    (prisma.characterData.create as Mock).mockResolvedValue(
      mockCharacterData({ id: 3, characterId: 1, referenceDataId: 100 })
    );

    const response = await POST(
      buildRequest({ referenceDataId: 100, visibility: "visible" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(201);
    expect(prisma.characterData.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visibility: DataVisibility.visible }),
      })
    );
  });

  // `freeOfCharge` resta un regalo immediato: forza sempre `visible`, anche
  // se il master avesse (per errore) inviato `visibility: "hidden"` insieme.
  it("freeOfCharge always forces visible, even when an explicit hidden visibility is also sent", async () => {
    asMaster("user-master-8");
    (prisma.character.findUnique as Mock).mockResolvedValue(
      mockCharacter({ id: 1, campaignId: 1, userId: "some-player" })
    );
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(
      buildDefinition({ dataType: { visibility: DataVisibility.hidden } })
    );
    (prisma.characterData.create as Mock).mockResolvedValue(
      mockCharacterData({ id: 4, characterId: 1, referenceDataId: 100 })
    );

    const response = await POST(
      buildRequest({
        referenceDataId: 100,
        visibility: "hidden",
        freeOfCharge: true,
      }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(201);
    expect(prisma.characterData.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visibility: DataVisibility.visible }),
      })
    );
  });
});
