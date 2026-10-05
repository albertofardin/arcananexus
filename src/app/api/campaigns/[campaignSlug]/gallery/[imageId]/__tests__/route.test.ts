import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { DELETE } from "../route";
import {
  mockCampaign,
  mockCampaignImage,
} from "@/test/helpers/prisma-fixtures";
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
    },
    grant: {
      findUnique: vi.fn(),
    },
    campaignImage: {
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/uploadthing", () => ({
  utapi: {
    deleteFiles: vi.fn(),
  },
}));

const buildParams = (campaignSlug: string, imageId: string) => ({
  params: Promise.resolve({ campaignSlug, imageId }),
});

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
};

const galleryImage = mockCampaignImage({
  id: 10,
  campaignId: 1,
  url: "https://utfs.io/f/gallery-key",
  key: "gallery-key",
});

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

describe("DELETE /api/campaigns/[campaignSlug]/gallery/[imageId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
  });

  it("returns 401 when the caller is not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await DELETE(
      new NextRequest("http://localhost/api/campaigns/campaign-a/gallery/10"),
      buildParams("campaign-a", "10")
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when the caller is only a master (not head_master)", async () => {
    asMaster();

    const response = await DELETE(
      new NextRequest("http://localhost/api/campaigns/campaign-a/gallery/10"),
      buildParams("campaign-a", "10")
    );

    expect(response.status).toBe(403);
    expect(prisma.campaignImage.delete).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid image id", async () => {
    asHeadMaster();

    const response = await DELETE(
      new NextRequest(
        "http://localhost/api/campaigns/campaign-a/gallery/not-a-number"
      ),
      buildParams("campaign-a", "not-a-number")
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when the image does not belong to this campaign (multi-tenant)", async () => {
    asHeadMaster();
    (prisma.campaignImage.findFirst as Mock).mockResolvedValue(null);

    const response = await DELETE(
      new NextRequest("http://localhost/api/campaigns/campaign-a/gallery/999"),
      buildParams("campaign-a", "999")
    );

    expect(response.status).toBe(404);
    expect(prisma.campaignImage.delete).not.toHaveBeenCalled();
  });

  it("deletes the file on UploadThing and removes the CampaignImage row", async () => {
    asHeadMaster();
    (prisma.campaignImage.findFirst as Mock).mockResolvedValue(galleryImage);
    (utapi.deleteFiles as Mock).mockResolvedValue({
      success: true,
      deletedCount: 1,
    });
    (prisma.campaignImage.delete as Mock).mockResolvedValue(galleryImage);

    const response = await DELETE(
      new NextRequest("http://localhost/api/campaigns/campaign-a/gallery/10"),
      buildParams("campaign-a", "10")
    );

    expect(response.status).toBe(204);
    expect(prisma.campaignImage.delete).toHaveBeenCalledWith({
      where: { id: 10 },
    });
    expect(utapi.deleteFiles).toHaveBeenCalledWith("gallery-key");
  });

  it("still deletes the row when the UploadThing cleanup fails (best-effort)", async () => {
    asHeadMaster();
    (prisma.campaignImage.findFirst as Mock).mockResolvedValue(galleryImage);
    (utapi.deleteFiles as Mock).mockRejectedValue(new Error("network error"));
    (prisma.campaignImage.delete as Mock).mockResolvedValue(galleryImage);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await DELETE(
      new NextRequest("http://localhost/api/campaigns/campaign-a/gallery/10"),
      buildParams("campaign-a", "10")
    );

    expect(response.status).toBe(204);
    consoleErrorSpy.mockRestore();
  });
});
