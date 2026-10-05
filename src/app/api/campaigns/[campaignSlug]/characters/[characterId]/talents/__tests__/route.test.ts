import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import {
  DataTypeAssignability,
  DataTypeKind,
  DataVisibility,
  Role,
} from "@prisma/client";
import { GET } from "../route";
import {
  mockCampaign,
  mockCharacter,
  mockGrant,
} from "@/test/helpers/prisma-fixtures";
// `vi.mock` è hoisted sopra gli import: questi import risolvono sempre ai
// moduli mockati sotto, a prescindere dall'ordine nel file sorgente.
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    campaign: { findFirst: vi.fn() },
    character: { findUnique: vi.fn() },
    grant: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    dataType: { findMany: vi.fn() },
    referenceData: { findMany: vi.fn() },
    characterData: { findMany: vi.fn() },
    dataRequirement: { findMany: vi.fn() },
    characterTalentUnlock: { findMany: vi.fn() },
  },
}));

const buildParams = (campaignSlug: string, characterId: string) => ({
  params: Promise.resolve({ campaignSlug, characterId }),
});

function buildRequest(query = "") {
  return new NextRequest(
    `http://localhost/api/campaigns/campaign-a/characters/1/talents${query}`
  );
}

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
};

const owner = { id: "user-owner", email: "owner@example.com" };
const supporter = { id: "user-supporter", email: "supporter@example.com" };
const stranger = { id: "user-stranger", email: "stranger@example.com" };

const playerCharacter = mockCharacter({
  id: 1,
  campaignId: 1,
  userId: owner.id,
});

describe("GET /api/campaigns/[campaignSlug]/characters/[characterId]/talents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.campaign.findFirst as unknown as Mock).mockResolvedValue(campaignA);
    (prisma.character.findUnique as unknown as Mock).mockResolvedValue(
      playerCharacter
    );
    (prisma.dataType.findMany as unknown as Mock).mockResolvedValue([]);
    (prisma.referenceData.findMany as unknown as Mock).mockResolvedValue([]);
    (prisma.characterData.findMany as unknown as Mock).mockResolvedValue([]);
    (prisma.dataRequirement.findMany as unknown as Mock).mockResolvedValue([]);
    (
      prisma.characterTalentUnlock.findMany as unknown as Mock
    ).mockResolvedValue([]);
  });

  it("returns 401 without a session", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-a", "1"));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the campaign does not exist", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: owner,
    });
    (prisma.campaign.findFirst as unknown as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-a", "1"));

    expect(response.status).toBe(404);
  });

  it("returns 404 when the character does not exist in the resolved campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: owner,
    });
    (prisma.character.findUnique as unknown as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-a", "1"));

    expect(response.status).toBe(404);
  });

  it("returns 403 for a user who is neither the owner nor campaign staff", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: stranger,
    });
    (prisma.grant.findUnique as unknown as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-a", "1"));

    expect(response.status).toBe(403);
  });

  it("allows the character owner and returns only the player-assignable talents", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: owner,
    });
    (prisma.grant.findUnique as unknown as Mock).mockResolvedValue(null);
    (prisma.dataType.findMany as unknown as Mock).mockResolvedValue([
      {
        id: 10,
        kind: DataTypeKind.talent,
        assignability: DataTypeAssignability.masterOnly,
      },
      {
        id: 11,
        kind: DataTypeKind.talent,
        assignability: DataTypeAssignability.always,
      },
    ]);
    (prisma.referenceData.findMany as unknown as Mock).mockResolvedValueOnce([
      {
        id: 1,
        dataTypeId: 10,
        name: "Solo master",
        flags: null,
        visibility: DataVisibility.visible,
      },
      {
        id: 2,
        dataTypeId: 11,
        name: "Chiunque",
        flags: null,
        visibility: DataVisibility.visible,
      },
    ]);

    const response = await GET(buildRequest(), buildParams("campaign-a", "1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.acquirableTalents.map((t: { id: number }) => t.id)).toEqual([
      2,
    ]);
  });

  it("grants master-level talent visibility to any campaign staff role, not just master/head_master", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: supporter,
    });
    (prisma.grant.findUnique as unknown as Mock).mockResolvedValue(
      mockGrant({ userId: supporter.id, campaignId: 1, role: Role.supporter })
    );
    (prisma.dataType.findMany as unknown as Mock).mockResolvedValue([
      {
        id: 10,
        kind: DataTypeKind.talent,
        assignability: DataTypeAssignability.masterOnly,
      },
    ]);
    (prisma.referenceData.findMany as unknown as Mock).mockResolvedValueOnce([
      {
        id: 1,
        dataTypeId: 10,
        name: "Solo master",
        flags: null,
        visibility: DataVisibility.visible,
      },
    ]);

    const response = await GET(buildRequest(), buildParams("campaign-a", "1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.acquirableTalents.map((t: { id: number }) => t.id)).toEqual([
      1,
    ]);
  });

  it("con ?view=player lo staff vede il catalogo come un giocatore (niente talenti masterOnly)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: supporter,
    });
    (prisma.grant.findUnique as unknown as Mock).mockResolvedValue(
      mockGrant({ userId: supporter.id, campaignId: 1, role: Role.supporter })
    );
    (prisma.dataType.findMany as unknown as Mock).mockResolvedValue([
      {
        id: 10,
        kind: DataTypeKind.talent,
        assignability: DataTypeAssignability.masterOnly,
      },
    ]);
    (prisma.referenceData.findMany as unknown as Mock).mockResolvedValueOnce([
      {
        id: 1,
        dataTypeId: 10,
        name: "Solo master",
        flags: null,
        visibility: DataVisibility.visible,
      },
    ]);

    const response = await GET(
      buildRequest("?view=player"),
      buildParams("campaign-a", "1")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.acquirableTalents).toEqual([]);
  });
});
