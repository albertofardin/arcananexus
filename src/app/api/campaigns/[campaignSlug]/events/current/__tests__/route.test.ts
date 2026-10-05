import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { GET } from "../route";
import { mockCampaign } from "@/test/helpers/prisma-fixtures";
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
    event: {
      findFirst: vi.fn(),
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

function buildRequest() {
  return new NextRequest(
    "http://localhost/api/campaigns/campaign-a/events/current",
    { method: "GET" }
  );
}

describe("GET /api/campaigns/[campaignSlug]/events/current", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the campaign slug does not resolve", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("unknown"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the caller has no campaign role", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    expect(response.status).toBe(403);
  });

  it("returns null when the campaign has no event yet", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.event.findFirst as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-a"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toBeNull();
  });

  it("returns the campaign's current event for a head_master", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    const event = {
      id: 5,
      name: "Evento",
      dateEventStart: new Date().toISOString(),
    };
    (prisma.event.findFirst as Mock).mockResolvedValue(event);

    const response = await GET(buildRequest(), buildParams("campaign-a"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(event);
    expect(prisma.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { campaignId: 1, dateEventStart: expect.anything() },
      })
    );
  });

  it("does not allow a campaign A head_master to read campaign B's event (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-b"));

    expect(response.status).toBe(403);
  });
});
