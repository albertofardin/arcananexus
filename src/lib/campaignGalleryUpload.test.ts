/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Role } from "@prisma/client";
import {
  authorizeCampaignGalleryUpload,
  applyCampaignGalleryUpload,
} from "./campaignGalleryUpload";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockCampaign,
  mockCampaignImage,
  mockGrant,
} from "@/test/helpers/prisma-fixtures";

describe("authorizeCampaignGalleryUpload", () => {
  const campaign = mockCampaign({ id: 1, slug: "test-campaign" });

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.campaign.findFirst.mockResolvedValue(campaign);
    prismaMock.grant.findUnique.mockResolvedValue(
      mockGrant({ userId: "user-1", campaignId: 1, role: Role.head_master })
    );
  });

  it("returns 401 when the caller is not authenticated", async () => {
    const result = await authorizeCampaignGalleryUpload(prismaClient, {
      userId: null,
      userEmail: null,
      campaignSlug: "test-campaign",
      newFilesCount: 1,
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      message: "Non autenticato",
    });
  });

  it("returns 404 when the campaign slug does not resolve", async () => {
    prismaMock.campaign.findFirst.mockResolvedValue(null);

    const result = await authorizeCampaignGalleryUpload(prismaClient, {
      userId: "user-1",
      userEmail: "user@example.com",
      campaignSlug: "unknown",
      newFilesCount: 1,
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      message: "Campagna non trovata",
    });
  });

  it("returns 403 when the caller is not head_master of the campaign", async () => {
    prismaMock.grant.findUnique.mockResolvedValue(
      mockGrant({ userId: "user-1", campaignId: 1, role: Role.master })
    );

    const result = await authorizeCampaignGalleryUpload(prismaClient, {
      userId: "user-1",
      userEmail: "user@example.com",
      campaignSlug: "test-campaign",
      newFilesCount: 1,
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      message: "Permessi insufficienti",
    });
  });

  it("allows the upload when the gallery has room for the new files", async () => {
    prismaMock.campaignImage.count.mockResolvedValue(3);

    const result = await authorizeCampaignGalleryUpload(prismaClient, {
      userId: "user-1",
      userEmail: "user@example.com",
      campaignSlug: "test-campaign",
      newFilesCount: 2,
    });

    expect(result).toEqual({
      ok: true,
      context: { campaignId: 1, campaignSlug: "test-campaign" },
    });
  });

  it("rejects the upload when existing + new images would exceed the cap of 9", async () => {
    prismaMock.campaignImage.count.mockResolvedValue(8);

    const result = await authorizeCampaignGalleryUpload(prismaClient, {
      userId: "user-1",
      userEmail: "user@example.com",
      campaignSlug: "test-campaign",
      newFilesCount: 2,
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      message: "La galleria può contenere al massimo 9 immagini",
    });
  });

  it("rejects the upload when the gallery is already full", async () => {
    prismaMock.campaignImage.count.mockResolvedValue(9);

    const result = await authorizeCampaignGalleryUpload(prismaClient, {
      userId: "user-1",
      userEmail: "user@example.com",
      campaignSlug: "test-campaign",
      newFilesCount: 1,
    });

    expect(result.ok).toBe(false);
  });

  it("allows exactly reaching the cap of 9", async () => {
    prismaMock.campaignImage.count.mockResolvedValue(7);

    const result = await authorizeCampaignGalleryUpload(prismaClient, {
      userId: "user-1",
      userEmail: "user@example.com",
      campaignSlug: "test-campaign",
      newFilesCount: 2,
    });

    expect(result.ok).toBe(true);
  });

  it("returns 403 for a hardcoded sviluppo email without a campaign grant (nessun bypass generico)", async () => {
    prismaMock.grant.findUnique.mockResolvedValue(null);
    prismaMock.campaignImage.count.mockResolvedValue(0);

    const result = await authorizeCampaignGalleryUpload(prismaClient, {
      userId: "user-1",
      userEmail: "mattia@arcana.it",
      campaignSlug: "test-campaign",
      newFilesCount: 1,
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      message: "Permessi insufficienti",
    });
  });
});

describe("applyCampaignGalleryUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("appends a new CampaignImage with order set to the current count", async () => {
    prismaMock.campaignImage.count.mockResolvedValue(2);
    const created = mockCampaignImage({ id: 10, campaignId: 1, order: 2 });
    prismaMock.campaignImage.create.mockResolvedValue(created);

    const result = await applyCampaignGalleryUpload(
      prismaClient,
      { campaignId: 1, campaignSlug: "test-campaign" },
      { url: "https://utfs.io/f/gallery-key", key: "gallery-key" }
    );

    expect(result).toEqual(created);
    expect(prismaMock.campaignImage.create).toHaveBeenCalledWith({
      data: {
        campaignId: 1,
        url: "https://utfs.io/f/gallery-key",
        key: "gallery-key",
        order: 2,
      },
    });
  });

  it("orders the first image of an empty gallery at 0", async () => {
    prismaMock.campaignImage.count.mockResolvedValue(0);
    prismaMock.campaignImage.create.mockResolvedValue(
      mockCampaignImage({ id: 1, campaignId: 1, order: 0 })
    );

    await applyCampaignGalleryUpload(
      prismaClient,
      { campaignId: 1, campaignSlug: "test-campaign" },
      { url: "https://utfs.io/f/gallery-key", key: "gallery-key" }
    );

    expect(prismaMock.campaignImage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ order: 0 }) })
    );
  });
});
