import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { DataTypeKind, Role } from "@prisma/client";
import { POST } from "../route";
import {
  mockCampaign,
  mockCharacter,
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
    characterTalentUnlock: { upsert: vi.fn() },
  },
}));

const buildParams = (campaignSlug: string, characterId: string) => ({
  params: Promise.resolve({ campaignSlug, characterId }),
});

function buildRequest(body: unknown) {
  return new NextRequest(
    "http://localhost/api/campaigns/campaign-a/characters/1/talents/unlocks",
    { method: "POST", body: JSON.stringify(body) }
  );
}

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
};
const character = mockCharacter({ id: 1, campaignId: 1 });
const hiddenTalent = {
  ...mockReferenceData({ id: 42, dataTypeId: 10 }),
  dataType: mockDataType({ id: 10, campaignId: 1, kind: DataTypeKind.talent }),
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

describe("POST /api/campaigns/[campaignSlug]/characters/[characterId]/talents/unlocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findUnique as Mock).mockResolvedValue(character);
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(hiddenTalent);
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest({ referenceDataId: 42 }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 for an ordinary player (no master-or-above Grant)", async () => {
    asPlayer();

    const response = await POST(
      buildRequest({ referenceDataId: 42 }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(403);
    expect(prisma.characterTalentUnlock.upsert).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body", async () => {
    asMaster();

    const response = await POST(
      buildRequest({ referenceDataId: "not-a-number" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when the character does not belong to this campaign", async () => {
    asMaster();
    (prisma.character.findUnique as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest({ referenceDataId: 42 }),
      buildParams("campaign-a", "999")
    );

    expect(response.status).toBe(404);
    expect(prisma.characterTalentUnlock.upsert).not.toHaveBeenCalled();
  });

  it("returns 404 when the ReferenceData is not a talent (e.g. an origin)", async () => {
    asMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue({
      ...mockReferenceData({ id: 42, dataTypeId: 10 }),
      dataType: mockDataType({
        id: 10,
        campaignId: 1,
        kind: DataTypeKind.assignable,
      }),
    });

    const response = await POST(
      buildRequest({ referenceDataId: 42 }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(404);
    expect(prisma.characterTalentUnlock.upsert).not.toHaveBeenCalled();
  });

  it("allows a master to unlock a hidden talent for this character", async () => {
    asMaster();
    (prisma.characterTalentUnlock.upsert as Mock).mockResolvedValue({
      id: 1,
      characterId: 1,
      referenceDataId: 42,
      unlockedById: "user-master",
      createdAt: new Date("2024-01-01"),
    });

    const response = await POST(
      buildRequest({ referenceDataId: 42 }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(201);
    expect(prisma.characterTalentUnlock.upsert).toHaveBeenCalledWith({
      where: {
        characterId_referenceDataId: { characterId: 1, referenceDataId: 42 },
      },
      create: {
        characterId: 1,
        referenceDataId: 42,
        unlockedById: "user-master",
      },
      update: {},
    });
  });
});
