import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { GET } from "../route";
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
    action: { findFirst: vi.fn() },
  },
}));

const buildParams = (campaignSlug: string, id: string) => ({
  params: Promise.resolve({ campaignSlug, id }),
});

function buildRequest() {
  return new NextRequest(
    "http://localhost/api/campaigns/campaign-a/downtime/1"
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

function asPlayer() {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: "user-1", email: "player@example.com" },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue(null);
}

const downtimeAction = () => ({
  id: 1,
  characterId: 10,
  featureId: 5,
  creationDate: new Date("2024-06-01"),
  actionData: {
    category: "Lavorare",
    description: "<p>Ho lavorato in miniera</p>",
    masterNote: "<p>Sospetto stia mentendo</p>",
  },
  character: {
    id: 10,
    name: "Aldric",
    avatar: null,
    user: { name: "Mario Rossi" },
  },
});

describe("GET /api/campaigns/[campaignSlug]/downtime/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-a", "1"));

    expect(response.status).toBe(401);
  });

  it("returns 400 for a non-numeric id", async () => {
    asMaster();

    const response = await GET(
      buildRequest(),
      buildParams("campaign-a", "abc")
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown campaign slug", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-a", "1"));

    expect(response.status).toBe(404);
  });

  it("returns the downtime detail for a master", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findFirst as Mock).mockResolvedValue(downtimeAction());

    const response = await GET(buildRequest(), buildParams("campaign-a", "1"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      id: 1,
      description: "<p>Ho lavorato in miniera</p>",
      author: { id: 10, name: "Aldric", userName: "Mario Rossi" },
      category: "Lavorare",
      readDate: null,
      masterNote: "<p>Sospetto stia mentendo</p>",
    });
  });

  it("returns 404 (not another status) when the downtime is not visible to the player", async () => {
    asPlayer();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      mockCharacter({ id: 99, name: "Someone Else", userId: "user-1" }),
    ]);
    // `getDowntimeByIdScoped` applica il filtro di visibilità nella `where`:
    // un mock che restituisce sempre `null` simula il caso "non trovato
    // dentro lo scope del viewer".
    (prisma.action.findFirst as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-a", "1"));

    expect(response.status).toBe(404);
    expect(prisma.action.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 1,
          characterId: { in: [99] },
        }),
      })
    );
  });

  it("a player can see a downtime of their own character", async () => {
    asPlayer();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      mockCharacter({ id: 10, name: "Aldric", userId: "user-1" }),
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(downtimeAction());

    const response = await GET(buildRequest(), buildParams("campaign-a", "1"));

    expect(response.status).toBe(200);
    const body = await response.json();
    // La nota riservata (T-0xx) non deve mai raggiungere il client per un
    // viewer non master, anche se presente nell'`actionData` grezzo.
    expect(body.masterNote).toBeNull();
  });
});
