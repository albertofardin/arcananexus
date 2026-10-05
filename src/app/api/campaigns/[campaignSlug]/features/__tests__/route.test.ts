import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { GET, POST } from "../route";
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
    featureType: {
      findUnique: vi.fn(),
    },
    feature: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const buildParams = (campaignSlug: string) => ({
  params: Promise.resolve({ campaignSlug }),
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

function buildRequest(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/campaigns/campaign-a/features", {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("GET /api/campaigns/[campaignSlug]/features", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest("GET"), buildParams("campaign-a"));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the campaign slug does not resolve", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest("GET"), buildParams("unknown"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the caller is not head_master of the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest("GET"), buildParams("campaign-a"));

    expect(response.status).toBe(403);
  });

  it("returns 200 with the campaign's configured features for a head_master", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    const features = [
      {
        ...mockFeature({ id: 1, campaignId: 1 }),
        featureType: mockFeatureType(),
      },
    ];
    (prisma.feature.findMany as Mock).mockResolvedValue(features);

    const response = await GET(buildRequest("GET"), buildParams("campaign-a"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(features);
    expect(prisma.feature.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { campaignId: 1 } })
    );
  });

  it("does not allow a campaign A head_master to read campaign B's features (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest("GET"), buildParams("campaign-b"));

    expect(response.status).toBe(403);
  });
});

describe("POST /api/campaigns/[campaignSlug]/features", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest("POST", { featureTypeId: 1, featureData: {} }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when the caller is not head_master of the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest("POST", { featureTypeId: 1, featureData: {} }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(403);
    expect(prisma.feature.create).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid input (missing featureTypeId)", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();

    const response = await POST(
      buildRequest("POST", { featureData: {} }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when the featureTypeId does not resolve to a catalog entry", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.featureType.findUnique as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest("POST", { featureTypeId: 999, featureData: {} }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(404);
    expect(prisma.feature.create).not.toHaveBeenCalled();
  });

  it("returns 422 when the featureTypeId's functionName has no registered handler", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.featureType.findUnique as Mock).mockResolvedValue(
      mockFeatureType({ id: 3, functionName: "notRegistered" })
    );

    const response = await POST(
      buildRequest("POST", { featureTypeId: 3, featureData: {} }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(422);
    expect(prisma.feature.create).not.toHaveBeenCalled();
  });

  it("returns 422 when featureData does not satisfy the handler's real featureSchema", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    // functionName reale registrato dal registry (T-019): il suo
    // `featureSchema` è `progressFeatureSchema` (T-0xx, fusione
    // talents/deathXpRecovery), che vincola `deathXpRecoveryPercentage` a 0-100.
    (prisma.featureType.findUnique as Mock).mockResolvedValue(
      mockFeatureType({ id: 4, functionName: "deathXpRecovery" })
    );

    const response = await POST(
      buildRequest("POST", {
        featureTypeId: 4,
        featureData: { deathXpRecoveryPercentage: 150 },
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(422);
    expect(prisma.feature.create).not.toHaveBeenCalled();
  });

  it("creates the feature scoped to the resolved campaign when featureData satisfies the real featureSchema", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    // "progress" non richiede campi obbligatori: ogni campo ha un
    // default (vedi `handlers/progress.ts`).
    (prisma.featureType.findUnique as Mock).mockResolvedValue(
      mockFeatureType({ id: 5, functionName: "progress" })
    );
    // `createFeature` (T-0xx) è un `prisma.feature.upsert` atomico: il branch
    // `create`/`update` è deciso da Postgres, il mock qui rappresenta solo il
    // risultato (nessuna `Feature` esistente → creazione).
    const created = {
      ...mockFeature({ id: 1, campaignId: 1, featureTypeId: 5 }),
      featureType: mockFeatureType({
        id: 5,
        functionName: "progress",
      }),
    };
    (prisma.feature.upsert as Mock).mockResolvedValue(created);

    const response = await POST(
      buildRequest("POST", { featureTypeId: 5, featureData: {} }),
      buildParams("campaign-a")
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual(created);
    expect(prisma.feature.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          featureTypeId_campaignId: { featureTypeId: 5, campaignId: 1 },
        },
        create: expect.objectContaining({ campaignId: 1, featureTypeId: 5 }),
      })
    );
  });

  it("reactivates an existing disabled feature instead of duplicating it (upsert-aware, T-0xx)", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.featureType.findUnique as Mock).mockResolvedValue(
      mockFeatureType({ id: 5, functionName: "progress" })
    );
    const reactivated = {
      ...mockFeature({ id: 7, campaignId: 1, featureTypeId: 5 }),
      featureType: mockFeatureType({ id: 5, functionName: "progress" }),
    };
    (prisma.feature.upsert as Mock).mockResolvedValue(reactivated);

    const response = await POST(
      buildRequest("POST", { featureTypeId: 5, featureData: {} }),
      buildParams("campaign-a")
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual(reactivated);
    // "progress" applica i default del suo `featureSchema` a un `{}`
    // in ingresso, sia nel branch `create` sia in quello `update`
    // dell'upsert.
    expect(prisma.feature.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          featureTypeId_campaignId: { featureTypeId: 5, campaignId: 1 },
        },
        update: {
          featureData: {
            talentsEnabled: false,
            progressionMode: "xp",
            deathXpRecoveryEnabled: false,
            deathXpRecoveryPercentage: 50,
          },
          active: true,
        },
      })
    );
  });

  it("does not allow a campaign A head_master to create features on campaign B (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest("POST", { featureTypeId: 1, featureData: {} }),
      buildParams("campaign-b")
    );

    expect(response.status).toBe(403);
    expect(prisma.feature.create).not.toHaveBeenCalled();
  });
});
