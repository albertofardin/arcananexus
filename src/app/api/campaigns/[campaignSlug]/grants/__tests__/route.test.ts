import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { GET, POST } from "../route";
import { mockCampaign, mockUser } from "@/test/helpers/prisma-fixtures";
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
      findMany: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
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

describe("GET /api/campaigns/[campaignSlug]/grants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants"
    );
    const response = await GET(request, buildParams("campaign-a"));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the campaign slug does not resolve", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/unknown/grants"
    );
    const response = await GET(request, buildParams("unknown"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the user is not head_master of the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants"
    );
    const response = await GET(request, buildParams("campaign-a"));

    expect(response.status).toBe(403);
  });

  it("returns 200 with assignments and users for a campaign head_master", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "user-1",
      campaignId: 1,
      role: Role.head_master,
    });
    (prisma.grant.findMany as Mock).mockResolvedValue([
      {
        userId: "user-1",
        campaignId: 1,
        role: Role.head_master,
        user: mockUser({ id: "user-1" }),
      },
    ]);
    (prisma.user.findMany as Mock).mockResolvedValue([
      {
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
        image: null,
      },
    ]);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants"
    );
    const response = await GET(request, buildParams("campaign-a"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.campaign).toMatchObject({ id: 1, slug: "campaign-a" });
    expect(json.assignments).toEqual([
      { userId: "user-1", role: "head_master" },
    ]);
    expect(json.users).toEqual([
      {
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
        image: null,
      },
    ]);
  });

  it("scopes grants to the resolved campaign only (no cross-tenant leakage)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "user-1",
      campaignId: 1,
      role: Role.head_master,
    });
    (prisma.grant.findMany as Mock).mockResolvedValue([]);
    (prisma.user.findMany as Mock).mockResolvedValue([]);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants"
    );
    await GET(request, buildParams("campaign-a"));

    expect(prisma.grant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { campaignId: 1 } })
    );
  });

  it("returns 200 for a campaign supporter (sola lettura)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-3", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "user-3",
      campaignId: 1,
      role: Role.supporter,
    });
    (prisma.grant.findMany as Mock).mockResolvedValue([]);
    (prisma.user.findMany as Mock).mockResolvedValue([]);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants"
    );
    const response = await GET(request, buildParams("campaign-a"));

    expect(response.status).toBe(200);
  });

  it("does not allow a campaign A head_master to read campaign B's grants (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    // User 1 requests campaign B, but only has a head_master grant on A;
    // the lookup for B's grant (composite key: user-1/campaignId 2) returns null.
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/grants"
    );
    const response = await GET(request, buildParams("campaign-b"));

    expect(response.status).toBe(403);
  });
});

describe("POST /api/campaigns/[campaignSlug]/grants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants",
      {
        method: "POST",
        body: JSON.stringify({ userId: "user-2", role: "master" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(401);
  });

  it("returns 400 on invalid input", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "user-1",
      campaignId: 1,
      role: Role.head_master,
    });

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants",
      {
        method: "POST",
        body: JSON.stringify({ userId: "", role: "not-a-role" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(400);
  });

  it("returns 403 when the caller is not head_master of the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-2", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants",
      {
        method: "POST",
        body: JSON.stringify({ userId: "user-3", role: "master" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(403);
  });

  it("creates a grant scoped to the resolved campaign id", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "user-1",
      campaignId: 1,
      role: Role.head_master,
    });
    (prisma.grant.create as Mock).mockResolvedValue({
      userId: "user-2",
      campaignId: 1,
      role: Role.master,
      user: mockUser({ id: "user-2" }),
    });

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants",
      {
        method: "POST",
        body: JSON.stringify({ userId: "user-2", role: "master" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ userId: "user-2", role: "master" });
    expect(prisma.grant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: "user-2", campaignId: 1, role: "master" },
      })
    );
  });

  it("does not allow a campaign master to create a grant (master is read-only)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "user-1",
      campaignId: 1,
      role: Role.master,
    });

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants",
      {
        method: "POST",
        body: JSON.stringify({ userId: "user-2", role: "supporter" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(403);
    expect(prisma.grant.create).not.toHaveBeenCalled();
  });

  it("does not allow a campaign supporter to create a grant", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-3", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "user-3",
      campaignId: 1,
      role: Role.supporter,
    });

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/grants",
      {
        method: "POST",
        body: JSON.stringify({ userId: "user-2", role: "supporter" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(403);
    expect(prisma.grant.create).not.toHaveBeenCalled();
  });

  it("does not allow a campaign A head_master to grant roles on campaign B (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/grants",
      {
        method: "POST",
        body: JSON.stringify({ userId: "user-4", role: "master" }),
      }
    );
    const response = await POST(request, buildParams("campaign-b"));

    expect(response.status).toBe(403);
    expect(prisma.grant.create).not.toHaveBeenCalled();
  });
});
