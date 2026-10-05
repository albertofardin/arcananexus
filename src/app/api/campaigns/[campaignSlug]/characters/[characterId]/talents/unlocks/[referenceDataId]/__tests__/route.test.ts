import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { DELETE } from "../route";
import { mockCampaign, mockCharacter } from "@/test/helpers/prisma-fixtures";
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
    characterTalentUnlock: { deleteMany: vi.fn() },
  },
}));

const buildParams = (
  campaignSlug: string,
  characterId: string,
  referenceDataId: string
) => ({
  params: Promise.resolve({ campaignSlug, characterId, referenceDataId }),
});

function buildRequest() {
  return new NextRequest(
    "http://localhost/api/campaigns/campaign-a/characters/1/talents/unlocks/42",
    { method: "DELETE" }
  );
}

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
};
const character = mockCharacter({ id: 1, campaignId: 1 });

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

describe("DELETE /api/campaigns/[campaignSlug]/characters/[characterId]/talents/unlocks/[referenceDataId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findUnique as Mock).mockResolvedValue(character);
    (prisma.characterTalentUnlock.deleteMany as Mock).mockResolvedValue({
      count: 1,
    });
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await DELETE(
      buildRequest(),
      buildParams("campaign-a", "1", "42")
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 for an ordinary player (no master-or-above Grant)", async () => {
    asPlayer();

    const response = await DELETE(
      buildRequest(),
      buildParams("campaign-a", "1", "42")
    );

    expect(response.status).toBe(403);
    expect(prisma.characterTalentUnlock.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the character does not belong to this campaign", async () => {
    asMaster();
    (prisma.character.findUnique as Mock).mockResolvedValue(null);

    const response = await DELETE(
      buildRequest(),
      buildParams("campaign-a", "999", "42")
    );

    expect(response.status).toBe(404);
    expect(prisma.characterTalentUnlock.deleteMany).not.toHaveBeenCalled();
  });

  it("allows a master to lock the talent again for this character", async () => {
    asMaster();

    const response = await DELETE(
      buildRequest(),
      buildParams("campaign-a", "1", "42")
    );

    expect(response.status).toBe(204);
    expect(prisma.characterTalentUnlock.deleteMany).toHaveBeenCalledWith({
      where: { characterId: 1, referenceDataId: 42 },
    });
  });

  it("is idempotent when the unlock no longer exists", async () => {
    asMaster();
    (prisma.characterTalentUnlock.deleteMany as Mock).mockResolvedValue({
      count: 0,
    });

    const response = await DELETE(
      buildRequest(),
      buildParams("campaign-a", "1", "42")
    );

    expect(response.status).toBe(204);
  });
});
