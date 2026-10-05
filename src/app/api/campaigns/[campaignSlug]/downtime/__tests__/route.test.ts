import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { GET } from "../route";
import { mockCampaign, mockCharacter } from "@/test/helpers/prisma-fixtures";
// `vi.mock` è hoisted sopra gli import: questi import risolvono sempre ai
// moduli mockati sotto, stesso pattern degli altri test di route.
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
    action: { findMany: vi.fn() },
  },
}));

const buildParams = (campaignSlug: string) => ({
  params: Promise.resolve({ campaignSlug }),
});

function buildRequest(query = "") {
  return new NextRequest(
    `http://localhost/api/campaigns/campaign-a/downtime${query}`
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

// Supporter = "helper" nel linguaggio prodotto: vede tutto ma non modifica
// nulla, stesso trattamento di master/head_master (stessa regressione
// coperta da `missive/__tests__/route.test.ts`).
function asSupporter() {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: "user-supporter", email: "supporter@example.com" },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue({
    userId: "user-supporter",
    campaignId: 1,
    role: Role.supporter,
  });
}

const downtimeAction = (overrides?: {
  id?: number;
  characterId?: number | null;
  category?: string;
}) => ({
  id: overrides?.id ?? 1,
  characterId: overrides?.characterId ?? 10,
  featureId: 5,
  creationDate: new Date("2024-06-01"),
  actionData: {
    category: overrides?.category ?? "Lavorare",
    description: "<p>Ho lavorato in miniera</p>",
  },
  character:
    overrides?.characterId === null
      ? null
      : {
          id: overrides?.characterId ?? 10,
          name: "Aldric",
          avatar: null,
          user: { name: "Mario Rossi" },
        },
});

describe("GET /api/campaigns/[campaignSlug]/downtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    expect(response.status).toBe(401);
  });

  it("returns 404 for an unknown campaign slug", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    expect(response.status).toBe(404);
  });

  it("returns 400 for a malformed query param", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);

    const response = await GET(
      buildRequest("?dateFrom=not-a-date"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(400);
  });

  it("lists every downtime of the campaign for a master, without resolving own characters", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findMany as Mock).mockResolvedValue([downtimeAction()]);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.downtimes).toHaveLength(1);
    expect(body.downtimes[0]).toMatchObject({
      id: 1,
      author: { id: 10, name: "Aldric", userName: "Mario Rossi" },
      category: "Lavorare",
    });
    // Nessun `listUserCharacters` per un master (nessuna risoluzione dei
    // PROPRI personaggi, la visibilità è già "tutta la campagna").
    expect(prisma.character.findMany).not.toHaveBeenCalled();
    expect(prisma.action.findMany).toHaveBeenCalledTimes(2);
    // Nessun filtro di visibilità aggiuntivo per un master.
    expect(prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          feature: {
            campaignId: 1,
            featureType: { functionName: "downtime" },
          },
        }),
      })
    );
  });

  it("lists every downtime of the campaign for a supporter/helper too, not just master/head_master", async () => {
    asSupporter();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findMany as Mock).mockResolvedValue([downtimeAction()]);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.downtimes).toHaveLength(1);
  });

  it("scopes the query to the player's own characters", async () => {
    asPlayer();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      { ...mockCharacter({ id: 10, name: "Aldric", userId: "user-1" }) },
    ]);
    (prisma.action.findMany as Mock).mockResolvedValue([downtimeAction()]);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    expect(response.status).toBe(200);
    expect(prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          characterId: { in: [10] },
        }),
      })
    );
  });

  it("excludes downtime not owned by the player, even if it belongs to the campaign", async () => {
    asPlayer();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([]);
    (prisma.action.findMany as Mock).mockResolvedValue([]);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    expect(response.status).toBe(200);
    const [call] = (prisma.action.findMany as Mock).mock.calls;
    expect(call[0].where).toMatchObject({ id: -1 });
  });
});
