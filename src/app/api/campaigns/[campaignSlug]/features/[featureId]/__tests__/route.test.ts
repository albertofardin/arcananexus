import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { GET, PATCH, DELETE } from "../route";
import {
  mockCampaign,
  mockFeature,
  mockFeatureType,
} from "@/test/helpers/prisma-fixtures";
// `vi.mock` calls below are hoisted by Vitest above all imports, so these
// imports always resolve to the mocked modules regardless of source order.
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
    campaign: {
      findFirst: vi.fn(),
    },
    grant: {
      findUnique: vi.fn(),
    },
    feature: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const buildParams = (campaignSlug: string, featureId: string) => ({
  params: Promise.resolve({ campaignSlug, featureId }),
});

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
};
const campaignB = {
  ...mockCampaign({ id: 2, slug: "campaign-b" }),
  organization: { slug: "arcana-domine" },
};

function asHeadMaster() {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: "user-1", email: "u@x" },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue({
    userId: "user-1",
    campaignId: 1,
    role: Role.head_master,
  });
}

// "progress" è registrato nel registry reale (T-019, fusione
// talents/deathXpRecovery, Opzione B) con `progressFeatureSchema` come
// `featureSchema`: ogni campo ha un default, `{}` resta sempre valido,
// comodo per i test PATCH che non vogliono esercitare la validazione del
// contenuto.
const featureWithProgressType = {
  ...mockFeature({ id: 1, campaignId: 1, featureTypeId: 5 }),
  featureType: mockFeatureType({ id: 5, functionName: "progress" }),
};

describe("GET /api/campaigns/[campaignSlug]/features/[featureId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/features/1"
    );
    const response = await GET(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when the user is not head_master of the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/features/1"
    );
    const response = await GET(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(403);
  });

  it("returns 404 when the feature does not belong to the resolved campaign (multi-tenant)", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.feature.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/features/999"
    );
    const response = await GET(request, buildParams("campaign-a", "999"));

    expect(response.status).toBe(404);
  });

  it("returns 400 when the featureId path segment is not a valid id", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/features/not-a-number"
    );
    const response = await GET(
      request,
      buildParams("campaign-a", "not-a-number")
    );

    expect(response.status).toBe(400);
  });

  it("returns 200 with the feature scoped to the resolved campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.feature.findUnique as Mock).mockResolvedValue(
      featureWithProgressType
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/features/1"
    );
    const response = await GET(request, buildParams("campaign-a", "1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(featureWithProgressType);
    expect(prisma.feature.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, campaignId: 1 } })
    );
  });

  it("does not allow a campaign A head_master to read a feature via campaign B's slug (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/features/1"
    );
    const response = await GET(request, buildParams("campaign-b", "1"));

    expect(response.status).toBe(403);
  });
});

describe("PATCH /api/campaigns/[campaignSlug]/features/[featureId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/features/1",
      { method: "PATCH", body: JSON.stringify({ featureData: {} }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when the caller is not head_master of the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-2", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/features/1",
      { method: "PATCH", body: JSON.stringify({ featureData: {} }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(403);
  });

  it("returns 404 when the feature does not belong to the resolved campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.feature.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/features/999",
      { method: "PATCH", body: JSON.stringify({ featureData: {} }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "999"));

    expect(response.status).toBe(404);
  });

  it("returns 400 on invalid input (extra field, schema is strict)", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.feature.findUnique as Mock).mockResolvedValue(
      featureWithProgressType
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/features/1",
      {
        method: "PATCH",
        body: JSON.stringify({ featureData: {}, featureTypeId: 99 }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(400);
  });

  it("returns 422 when featureData does not satisfy the real featureSchema of the linked functionName", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.feature.findUnique as Mock).mockResolvedValue({
      ...mockFeature({ id: 1, campaignId: 1, featureTypeId: 4 }),
      featureType: mockFeatureType({ id: 4, functionName: "deathXpRecovery" }),
    });

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/features/1",
      {
        method: "PATCH",
        // `deathXpRecoveryPercentage` fuori range (0-100), vincolato dallo schema
        // reale (`progressFeatureSchema`, T-0xx).
        body: JSON.stringify({
          featureData: { deathXpRecoveryPercentage: 150 },
        }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(422);
    expect(prisma.feature.update).not.toHaveBeenCalled();
  });

  it("returns 200 and updates featureData scoped to the resolved campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.feature.findUnique as Mock).mockResolvedValue(
      featureWithProgressType
    );
    const updated = { ...featureWithProgressType, featureData: {} };
    (prisma.feature.update as Mock).mockResolvedValue(updated);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/features/1",
      { method: "PATCH", body: JSON.stringify({ featureData: {} }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(updated);
    expect(prisma.feature.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } })
    );
  });

  // T-0xx (soft-toggle): `active` da solo, senza `featureData`, deve
  // aggiornare SOLO `active` — niente validazione contro il `featureSchema`
  // dell'handler (non c'è `featureData` da validare).
  it("returns 200 and updates only active when featureData is omitted", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.feature.findUnique as Mock).mockResolvedValue(
      featureWithProgressType
    );
    const updated = { ...featureWithProgressType, active: true };
    (prisma.feature.update as Mock).mockResolvedValue(updated);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/features/1",
      { method: "PATCH", body: JSON.stringify({ active: true }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(updated);
    expect(prisma.feature.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { active: true },
      })
    );
  });

  it("does not allow a campaign A head_master to patch a feature via campaign B's slug (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/features/1",
      { method: "PATCH", body: JSON.stringify({ featureData: {} }) }
    );
    const response = await PATCH(request, buildParams("campaign-b", "1"));

    expect(response.status).toBe(403);
    expect(prisma.feature.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/campaigns/[campaignSlug]/features/[featureId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/features/1",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the feature does not belong to the resolved campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.feature.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/features/999",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-a", "999"));

    expect(response.status).toBe(404);
  });

  // Soft-delete (T-0xx): `Action.feature` ha `onDelete: Cascade`, quindi un
  // hard delete perderebbe lo storico azioni già create contro questa
  // `Feature`. La route deve chiamare SOLO `feature.update({ active: false
  // })`, mai `feature.delete` — che infatti non deve mai essere invocato.
  it("returns 200 and deactivates the feature (soft-delete) instead of hard-deleting it, preserving its Action history", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.feature.findUnique as Mock).mockResolvedValue(
      featureWithProgressType
    );
    const deactivated = { ...featureWithProgressType, active: false };
    (prisma.feature.update as Mock).mockResolvedValue(deactivated);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/features/1",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-a", "1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(deactivated);
    expect(prisma.feature.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { active: false },
      })
    );
    expect(prisma.feature.delete).not.toHaveBeenCalled();
  });

  it("does not allow a campaign A head_master to delete a feature via campaign B's slug (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/features/1",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-b", "1"));

    expect(response.status).toBe(403);
    expect(prisma.feature.delete).not.toHaveBeenCalled();
  });
});
