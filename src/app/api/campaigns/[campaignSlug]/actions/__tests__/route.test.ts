import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { POST } from "../route";
import {
  mockAction,
  mockCampaign,
  mockCharacter,
  mockFeature,
  mockFeatureType,
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
    action: { findMany: vi.fn(), create: vi.fn() },
    feature: { findFirst: vi.fn() },
    character: { findUnique: vi.fn() },
    // T-0xx, notifica missiva: `createNotification` gira dopo la
    // risoluzione del destinatario reale (`character.findUnique` sopra).
    notification: { create: vi.fn(), createMany: vi.fn() },
  },
}));

const buildParams = (campaignSlug: string) => ({
  params: Promise.resolve({ campaignSlug }),
});

function buildPostRequest(body: unknown) {
  return new NextRequest("http://localhost/api/campaigns/campaign-a/actions", {
    method: "POST",
    body: JSON.stringify(body),
  });
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

describe("POST /api/campaigns/[campaignSlug]/actions (invio a nome del master)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const missiveFeature = {
    ...mockFeature({ id: 9, campaignId: 1, featureData: {} }),
    featureType: mockFeatureType({
      id: 2,
      featureName: "Missive",
      functionName: "missive",
    }),
  };

  it("returns 400 for a functionName other than missive", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);

    const response = await POST(
      buildPostRequest({ functionName: "talents", actionData: {} }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(400);
  });

  it("returns 401 when there is no session", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await POST(
      buildPostRequest({
        functionName: "missive",
        actionData: {
          description: "Ciao",
          subject: "Oggetto",
          receiverCharacterId: 3,
        },
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 for a user with no master-or-above Grant on the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "player@example.com" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await POST(
      buildPostRequest({
        functionName: "missive",
        actionData: {
          description: "Ciao",
          subject: "Oggetto",
          receiverCharacterId: 3,
        },
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 when the missive feature is not active in this campaign", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.feature.findFirst as Mock).mockResolvedValue(null);

    const response = await POST(
      buildPostRequest({
        functionName: "missive",
        actionData: {
          description: "Ciao",
          subject: "Oggetto",
          receiverCharacterId: 3,
        },
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(404);
  });

  it("creates an Action with characterId: null, bypassing missivePoints", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.feature.findFirst as Mock).mockResolvedValue(missiveFeature);
    (prisma.character.findUnique as Mock).mockResolvedValue(
      mockCharacter({ id: 3, campaignId: 1 })
    );
    (prisma.action.create as Mock).mockResolvedValue(
      mockAction({
        id: 99,
        characterId: null,
        featureId: 9,
        actionData: {
          description: "Ciao",
          subject: "Oggetto",
          receiverCharacterId: 3,
        },
      })
    );

    const response = await POST(
      buildPostRequest({
        functionName: "missive",
        actionData: {
          description: "Ciao",
          subject: "Oggetto",
          receiverCharacterId: 3,
        },
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.action.characterId).toBeNull();
    // `authorUserId` è sempre risolto dalla sessione server-side
    // (`access.userId`), mai dal payload — vedi `Action.authorUserId`.
    expect(prisma.action.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          characterId: null,
          authorUserId: "user-master",
        }),
      })
    );
  });

  it("returns 400 with the Zod issues when actionData does not match the missive schema", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.feature.findFirst as Mock).mockResolvedValue(missiveFeature);

    const response = await POST(
      buildPostRequest({ functionName: "missive", actionData: {} }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(400);
    expect(prisma.action.create).not.toHaveBeenCalled();
  });
});
