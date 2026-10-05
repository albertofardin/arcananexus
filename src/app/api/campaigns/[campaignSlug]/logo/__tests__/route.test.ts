import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { DELETE } from "../route";
import { mockCampaign } from "@/test/helpers/prisma-fixtures";
// `vi.mock` è hoisted sopra gli import: importarli qui è sicuro, risolvono
// sempre ai moduli mockati.
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { utapi } from "@/lib/uploadthing";

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
      update: vi.fn(),
    },
    grant: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/uploadthing", () => ({
  utapi: {
    deleteFiles: vi.fn(),
  },
}));

const buildParams = (campaignSlug: string) => ({
  params: Promise.resolve({ campaignSlug }),
});

const campaignA = {
  ...mockCampaign({
    id: 1,
    slug: "campaign-a",
    logo: "https://utfs.io/f/abc123",
    logoKey: "abc123",
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

describe("DELETE /api/campaigns/[campaignSlug]/logo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
  });

  it("returns 401 when the caller is not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await DELETE(
      new NextRequest("http://localhost/api/campaigns/campaign-a/logo"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when the caller is only a master (not head_master)", async () => {
    asMaster();

    const response = await DELETE(
      new NextRequest("http://localhost/api/campaigns/campaign-a/logo"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(403);
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the campaign slug does not resolve", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);
    asHeadMaster();

    const response = await DELETE(
      new NextRequest("http://localhost/api/campaigns/unknown/logo"),
      buildParams("unknown")
    );

    expect(response.status).toBe(404);
  });

  it("allows the campaign head_master to remove the logo", async () => {
    asHeadMaster();
    (prisma.campaign.update as Mock).mockResolvedValue({
      ...campaignA,
      logo: null,
      logoKey: null,
    });
    (utapi.deleteFiles as Mock).mockResolvedValue({
      success: true,
      deletedCount: 1,
    });

    const response = await DELETE(
      new NextRequest("http://localhost/api/campaigns/campaign-a/logo"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: null });
    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { logo: null, logoKey: null },
    });
    expect(utapi.deleteFiles).toHaveBeenCalledWith("abc123");
  });

  it("does not call UploadThing when there is no previous logo key", async () => {
    asHeadMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue({
      ...campaignA,
      logo: null,
      logoKey: null,
    });
    (prisma.campaign.update as Mock).mockResolvedValue({
      ...campaignA,
      logo: null,
      logoKey: null,
    });

    await DELETE(
      new NextRequest("http://localhost/api/campaigns/campaign-a/logo"),
      buildParams("campaign-a")
    );

    expect(utapi.deleteFiles).not.toHaveBeenCalled();
  });

  it("still succeeds when the UploadThing cleanup fails (best-effort)", async () => {
    asHeadMaster();
    (prisma.campaign.update as Mock).mockResolvedValue({
      ...campaignA,
      logo: null,
      logoKey: null,
    });
    (utapi.deleteFiles as Mock).mockRejectedValue(new Error("network error"));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await DELETE(
      new NextRequest("http://localhost/api/campaigns/campaign-a/logo"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(200);
    consoleErrorSpy.mockRestore();
  });
});
