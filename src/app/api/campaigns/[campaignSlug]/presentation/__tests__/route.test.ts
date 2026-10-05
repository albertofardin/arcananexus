import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { GET } from "../route";
import {
  mockCampaign,
  mockCampaignImage,
} from "@/test/helpers/prisma-fixtures";
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
    campaignImage: {
      findMany: vi.fn(),
    },
  },
}));

const buildParams = (campaignSlug: string) => ({
  params: Promise.resolve({ campaignSlug }),
});

const campaignA = {
  ...mockCampaign({
    id: 1,
    slug: "campaign-a",
    description: "Una campagna di prova",
    logo: "https://utfs.io/f/logo-key",
    cover: "https://utfs.io/f/cover-key",
  }),
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

function asMaster() {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: "user-1", email: "u@x" },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue({
    userId: "user-1",
    campaignId: 1,
    role: Role.master,
  });
}

function asSupporter() {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: "user-1", email: "u@x" },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue({
    userId: "user-1",
    campaignId: 1,
    role: Role.supporter,
  });
}

function asOutsider() {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: "user-1", email: "u@x" },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue(null);
}

describe("GET /api/campaigns/[campaignSlug]/presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
  });

  it("returns 401 when the caller is not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/campaigns/campaign-a/presentation"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when the caller has no grant on the campaign", async () => {
    asOutsider();

    const response = await GET(
      new NextRequest("http://localhost/api/campaigns/campaign-a/presentation"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(403);
  });

  it("returns 200 for a master (read-only staff, not just head_master)", async () => {
    asMaster();
    (prisma.campaignImage.findMany as Mock).mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost/api/campaigns/campaign-a/presentation"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(200);
  });

  it("returns 200 for a supporter (read-only staff)", async () => {
    asSupporter();
    (prisma.campaignImage.findMany as Mock).mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost/api/campaigns/campaign-a/presentation"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(200);
  });

  it("returns logo, cover, description and gallery images for the head_master", async () => {
    asHeadMaster();
    (prisma.campaignImage.findMany as Mock).mockResolvedValue([
      mockCampaignImage({ id: 1, campaignId: 1, url: "https://a", order: 0 }),
      mockCampaignImage({ id: 2, campaignId: 1, url: "https://b", order: 1 }),
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/campaigns/campaign-a/presentation"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "Test Campaign",
      slug: "campaign-a",
      description: "Una campagna di prova",
      logo: "https://utfs.io/f/logo-key",
      cover: "https://utfs.io/f/cover-key",
      color: "cobalt",
      texture: "none",
      images: [
        { id: 1, url: "https://a", order: 0 },
        { id: 2, url: "https://b", order: 1 },
      ],
    });
  });
});
