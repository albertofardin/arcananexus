import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { PATCH } from "../route";
import { mockCampaign, mockCharacter } from "@/test/helpers/prisma-fixtures";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    campaign: { findFirst: vi.fn() },
    grant: { findUnique: vi.fn() },
    character: { findMany: vi.fn() },
    action: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

const buildParams = (campaignSlug: string, id: string) => ({
  params: Promise.resolve({ campaignSlug, id }),
});

function buildRequest() {
  return new NextRequest(
    "http://localhost/api/campaigns/campaign-a/downtime/1/read",
    { method: "PATCH" }
  );
}

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
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

function asPlayer(userId: string) {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: userId, email: `${userId}@example.com` },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue(null);
}

const downtimeAction = (overrides?: { readDate?: string | null }) => ({
  id: 1,
  characterId: 10,
  featureId: 5,
  creationDate: new Date("2024-06-01"),
  actionData: {
    description: "<p>Ho lavorato in miniera</p>",
    readDate: overrides?.readDate ?? null,
  },
  character: {
    id: 10,
    name: "Aldric",
    avatar: null,
    user: { name: "Mario Rossi" },
  },
  feature: {
    featureType: { functionName: "downtimeWork", featureName: "Lavorare" },
  },
});

describe("PATCH /api/campaigns/[campaignSlug]/downtime/[id]/read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for a non-numeric id", async () => {
    asMaster();

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "abc")
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown campaign slug", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the downtime is not visible to the caller", async () => {
    asPlayer("user-stranger");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      mockCharacter({ id: 30, campaignId: 1, userId: "user-stranger" }),
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(404);
    expect(prisma.action.update).not.toHaveBeenCalled();
  });

  it("returns 403 when a player owning the downtime's own character tries to mark it read", async () => {
    // "user-1" possiede il PG 10 (l'autore di `downtimeAction`): la vede
    // (è la sua), ma non può segnarla come letta — solo un master può.
    asPlayer("user-1");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      { ...mockCharacter({ id: 10, campaignId: 1, userId: "user-1" }) },
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(downtimeAction());

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(403);
    expect(prisma.action.update).not.toHaveBeenCalled();
  });

  it("marks the downtime as read when a master opens it", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findFirst as Mock).mockResolvedValue(downtimeAction());

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(200);
    expect(prisma.action.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        actionData: expect.objectContaining({
          description: "<p>Ho lavorato in miniera</p>",
          readDate: expect.any(String),
        }),
      },
    });
  });

  it("is idempotent: does not call update again when already read", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findFirst as Mock).mockResolvedValue(
      downtimeAction({ readDate: "2024-06-02T00:00:00.000Z" })
    );

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(200);
    expect(prisma.action.update).not.toHaveBeenCalled();
  });
});
