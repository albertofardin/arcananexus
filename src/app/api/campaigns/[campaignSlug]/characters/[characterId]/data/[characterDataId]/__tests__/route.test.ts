import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { DataTypeKind, DataVisibility, Role } from "@prisma/client";
import { PATCH, DELETE } from "../route";
import {
  mockCampaign,
  mockCharacter,
  mockCharacterData,
  mockDataType,
  mockReferenceData,
  mockXpTransaction,
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
    character: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    characterData: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    xpTransaction: { create: vi.fn(), aggregate: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const buildParams = (
  campaignSlug: string,
  characterId: string,
  characterDataId: string
) => ({
  params: Promise.resolve({ campaignSlug, characterId, characterDataId }),
});

function buildRequest(body: unknown) {
  return new NextRequest(
    "http://localhost/api/campaigns/campaign-a/characters/1/data/5",
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

function buildDeleteRequest() {
  return new NextRequest(
    "http://localhost/api/campaigns/campaign-a/characters/1/data/5",
    { method: "DELETE" }
  );
}

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
};

const character = mockCharacter({ id: 1, campaignId: 1 });
// `dataType`/`referenceData` inclusi (T-0xx): `getCharacterDataByIdScoped`
// ora li include sempre. `kind: generic` di default (`mockDataType`) per i
// test che non riguardano la logica specifica dei talenti — vedi
// `talentCharacterData` sotto per i test della rimozione talento.
const hiddenCharacterData = {
  ...mockCharacterData({
    id: 5,
    characterId: 1,
    visibility: DataVisibility.hidden,
  }),
  dataType: mockDataType({ id: 1, campaignId: 1 }),
  referenceData: mockReferenceData({ id: 1, dataTypeId: 1 }),
};

function asMaster() {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: "user-master", email: "master@example.com" },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue({
    userId: "user-master",
    campaignId: 1,
    role: Role.master,
  });
}

function asPlayer() {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: "user-player", email: "player@example.com" },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue({
    userId: "user-player",
    campaignId: 1,
    role: Role.supporter,
  });
}

describe("PATCH /api/campaigns/[campaignSlug]/characters/[characterId]/data/[characterDataId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findUnique as Mock).mockResolvedValue(character);
    (prisma.characterData.findFirst as Mock).mockResolvedValue(
      hiddenCharacterData
    );
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildRequest({ visibility: "visible" }),
      buildParams("campaign-a", "1", "5")
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 for an ordinary player (no master-or-above Grant)", async () => {
    asPlayer();

    const response = await PATCH(
      buildRequest({ visibility: "visible" }),
      buildParams("campaign-a", "1", "5")
    );

    expect(response.status).toBe(403);
    expect(prisma.characterData.update).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body (unknown visibility value)", async () => {
    asMaster();

    const response = await PATCH(
      buildRequest({ visibility: "public" }),
      buildParams("campaign-a", "1", "5")
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for a non-numeric characterDataId", async () => {
    asMaster();

    const response = await PATCH(
      buildRequest({ visibility: "visible" }),
      buildParams("campaign-a", "1", "not-a-number")
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when the character does not belong to this campaign", async () => {
    asMaster();
    (prisma.character.findUnique as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildRequest({ visibility: "visible" }),
      buildParams("campaign-a", "999", "5")
    );

    expect(response.status).toBe(404);
    expect(prisma.characterData.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the CharacterData does not belong to this campaign/character (multi-tenant scoping)", async () => {
    asMaster();
    (prisma.characterData.findFirst as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildRequest({ visibility: "visible" }),
      buildParams("campaign-a", "1", "5")
    );

    expect(response.status).toBe(404);
    expect(prisma.characterData.update).not.toHaveBeenCalled();
    // Lo scoping passa per `dataType.campaignId` (relazione autoritativa):
    // verifica che la query sia stata scopata alla campagna risolta, non
    // lasciata "aperta" a qualunque CharacterData con quell'id.
    expect(prisma.characterData.findFirst).toHaveBeenCalledWith({
      where: { id: 5, characterId: 1, dataType: { campaignId: 1 } },
      include: { dataType: true, referenceData: true },
    });
  });

  it("allows a master to reveal a hidden CharacterData (sets visibility to visible)", async () => {
    asMaster();
    const updated = mockCharacterData({
      id: 5,
      characterId: 1,
      visibility: DataVisibility.visible,
    });
    (prisma.characterData.update as Mock).mockResolvedValue(updated);

    const response = await PATCH(
      buildRequest({ visibility: "visible" }),
      buildParams("campaign-a", "1", "5")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.characterData.visibility).toBe(DataVisibility.visible);
    expect(prisma.characterData.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { visibility: DataVisibility.visible },
    });
  });

  it("returns 403 for a hardcoded sviluppo email without a Grant (nessun bypass generico)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-super", email: "mattia@arcana.it" },
    });
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildRequest({ visibility: "hidden" }),
      buildParams("campaign-a", "1", "5")
    );

    expect(response.status).toBe(403);
    expect(prisma.characterData.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/campaigns/[campaignSlug]/characters/[characterId]/data/[characterDataId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findUnique as Mock).mockResolvedValue(character);
    (prisma.characterData.findFirst as Mock).mockResolvedValue(
      hiddenCharacterData
    );
    // Passthrough: esegue il callback con lo stesso `prisma` mockato, così
    // le asserzioni sotto vedono `characterData.delete`/`xpTransaction.create`
    // come se girassero dentro la transazione reale.
    (prisma.$transaction as Mock).mockImplementation(fn => fn(prisma));
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await DELETE(
      buildDeleteRequest(),
      buildParams("campaign-a", "1", "5")
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 for an ordinary player (no master-or-above Grant)", async () => {
    asPlayer();

    const response = await DELETE(
      buildDeleteRequest(),
      buildParams("campaign-a", "1", "5")
    );

    expect(response.status).toBe(403);
    expect(prisma.characterData.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when the CharacterData does not belong to this campaign/character (multi-tenant scoping)", async () => {
    asMaster();
    (prisma.characterData.findFirst as Mock).mockResolvedValue(null);

    const response = await DELETE(
      buildDeleteRequest(),
      buildParams("campaign-a", "1", "5")
    );

    expect(response.status).toBe(404);
    expect(prisma.characterData.delete).not.toHaveBeenCalled();
  });

  it("allows a master to remove a CharacterData", async () => {
    asMaster();
    (prisma.characterData.delete as Mock).mockResolvedValue(
      hiddenCharacterData
    );

    const response = await DELETE(
      buildDeleteRequest(),
      buildParams("campaign-a", "1", "5")
    );

    expect(response.status).toBe(204);
    expect(prisma.characterData.delete).toHaveBeenCalledWith({
      where: { id: 5 },
    });
  });

  it("does not create an XpTransaction when removing a non-talent CharacterData (e.g. an origin)", async () => {
    asMaster();
    (prisma.characterData.delete as Mock).mockResolvedValue(
      hiddenCharacterData
    );

    const response = await DELETE(
      buildDeleteRequest(),
      buildParams("campaign-a", "1", "5")
    );

    expect(response.status).toBe(204);
    expect(prisma.xpTransaction.create).not.toHaveBeenCalled();
  });

  it("removing a talent records a zero-amount XpTransaction attributed to the master, with no refund", async () => {
    asMaster();
    const talentCharacterData = {
      ...hiddenCharacterData,
      referenceDataId: 42,
      dataType: mockDataType({
        id: 1,
        campaignId: 1,
        kind: DataTypeKind.talent,
      }),
      referenceData: mockReferenceData({
        id: 42,
        dataTypeId: 1,
        flags: { cost: 12 },
      }),
    };
    (prisma.characterData.findFirst as Mock).mockResolvedValue(
      talentCharacterData
    );
    (prisma.characterData.delete as Mock).mockResolvedValue(
      talentCharacterData
    );
    (prisma.xpTransaction.create as Mock).mockResolvedValue(
      mockXpTransaction({ amount: 0, reason: "removal", referenceDataId: 42 })
    );

    const response = await DELETE(
      buildDeleteRequest(),
      buildParams("campaign-a", "1", "5")
    );

    expect(response.status).toBe(204);
    expect(prisma.characterData.delete).toHaveBeenCalledWith({
      where: { id: 5 },
    });
    expect(prisma.xpTransaction.create).toHaveBeenCalledWith({
      data: {
        characterId: 1,
        amount: 0,
        reason: "removal",
        referenceDataId: 42,
        updatedById: "user-master",
      },
    });
  });

  it("removing a talent with isDowntimePointBonus revokes the point and the personal bonus cap", async () => {
    asMaster();
    const bonusTalentData = {
      ...hiddenCharacterData,
      referenceDataId: 42,
      dataType: mockDataType({
        id: 1,
        campaignId: 1,
        kind: DataTypeKind.talent,
      }),
      referenceData: mockReferenceData({
        id: 42,
        dataTypeId: 1,
        flags: { isDowntimePointBonus: true },
      }),
    };
    (prisma.characterData.findFirst as Mock).mockResolvedValue(bonusTalentData);
    (prisma.characterData.delete as Mock).mockResolvedValue(bonusTalentData);
    (prisma.xpTransaction.create as Mock).mockResolvedValue(
      mockXpTransaction({ amount: 0, reason: "removal", referenceDataId: 42 })
    );
    (prisma.character.findUniqueOrThrow as Mock).mockResolvedValue({
      downtimePoints: 3,
      downtimePointsBonus: 2,
      missivePoints: 0,
      missivePointsBonus: 0,
    });

    const response = await DELETE(
      buildDeleteRequest(),
      buildParams("campaign-a", "1", "5")
    );

    expect(response.status).toBe(204);
    expect(prisma.character.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { downtimePoints: 2, downtimePointsBonus: 1 },
    });
  });

  it("removing a talent with isMissivePointBonus floors both counters at 0 instead of going negative", async () => {
    asMaster();
    const bonusTalentData = {
      ...hiddenCharacterData,
      referenceDataId: 42,
      dataType: mockDataType({
        id: 1,
        campaignId: 1,
        kind: DataTypeKind.talent,
      }),
      referenceData: mockReferenceData({
        id: 42,
        dataTypeId: 1,
        flags: { isMissivePointBonus: true },
      }),
    };
    (prisma.characterData.findFirst as Mock).mockResolvedValue(bonusTalentData);
    (prisma.characterData.delete as Mock).mockResolvedValue(bonusTalentData);
    (prisma.xpTransaction.create as Mock).mockResolvedValue(
      mockXpTransaction({ amount: 0, reason: "removal", referenceDataId: 42 })
    );
    // Il personaggio ha già speso il punto missiva guadagnato dal talento
    // (0 disponibili): la rimozione non deve far scendere il contatore
    // sotto zero.
    (prisma.character.findUniqueOrThrow as Mock).mockResolvedValue({
      downtimePoints: 0,
      downtimePointsBonus: 0,
      missivePoints: 0,
      missivePointsBonus: 0,
    });

    const response = await DELETE(
      buildDeleteRequest(),
      buildParams("campaign-a", "1", "5")
    );

    expect(response.status).toBe(204);
    expect(prisma.character.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { missivePoints: 0, missivePointsBonus: 0 },
    });
  });

  it("removing a talent without the point-bonus flags does not touch missive/downtime counters", async () => {
    asMaster();
    const talentCharacterData = {
      ...hiddenCharacterData,
      referenceDataId: 42,
      dataType: mockDataType({
        id: 1,
        campaignId: 1,
        kind: DataTypeKind.talent,
      }),
      referenceData: mockReferenceData({
        id: 42,
        dataTypeId: 1,
        flags: { cost: 12 },
      }),
    };
    (prisma.characterData.findFirst as Mock).mockResolvedValue(
      talentCharacterData
    );
    (prisma.characterData.delete as Mock).mockResolvedValue(
      talentCharacterData
    );
    (prisma.xpTransaction.create as Mock).mockResolvedValue(
      mockXpTransaction({ amount: 0, reason: "removal", referenceDataId: 42 })
    );

    const response = await DELETE(
      buildDeleteRequest(),
      buildParams("campaign-a", "1", "5")
    );

    expect(response.status).toBe(204);
    expect(prisma.character.update).not.toHaveBeenCalled();
  });
});
