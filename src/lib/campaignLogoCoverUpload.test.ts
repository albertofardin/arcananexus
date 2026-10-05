/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Role } from "@prisma/client";
import {
  authorizeCampaignLogoCoverUpload,
  applyCampaignLogoCoverUpload,
} from "./campaignLogoCoverUpload";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import { mockCampaign, mockGrant } from "@/test/helpers/prisma-fixtures";

describe.each(["logo", "cover"] as const)(
  "authorizeCampaignLogoCoverUpload (%s)",
  field => {
    const campaign = mockCampaign({
      id: 1,
      slug: "test-campaign",
      [`${field}Key`]: `old-${field}-key`,
    });

    beforeEach(() => {
      vi.clearAllMocks();
      prismaMock.campaign.findFirst.mockResolvedValue(campaign);
    });

    it("returns 401 when the caller is not authenticated", async () => {
      const result = await authorizeCampaignLogoCoverUpload(prismaClient, {
        userId: null,
        userEmail: null,
        campaignSlug: "test-campaign",
        field,
      });

      expect(result).toEqual({
        ok: false,
        status: 401,
        message: "Non autenticato",
      });
    });

    it("returns 404 when the campaign slug does not resolve", async () => {
      prismaMock.campaign.findFirst.mockResolvedValue(null);

      const result = await authorizeCampaignLogoCoverUpload(prismaClient, {
        userId: "user-1",
        userEmail: "user@example.com",
        campaignSlug: "unknown",
        field,
      });

      expect(result).toEqual({
        ok: false,
        status: 404,
        message: "Campagna non trovata",
      });
    });

    it.each([Role.master, Role.supporter])(
      "returns 403 when the caller is %s instead of head_master",
      async role => {
        prismaMock.grant.findUnique.mockResolvedValue(
          mockGrant({ userId: "user-1", campaignId: 1, role })
        );

        const result = await authorizeCampaignLogoCoverUpload(prismaClient, {
          userId: "user-1",
          userEmail: "user@example.com",
          campaignSlug: "test-campaign",
          field,
        });

        expect(result).toEqual({
          ok: false,
          status: 403,
          message: "Permessi insufficienti",
        });
      }
    );

    it("allows the campaign head_master and resolves the previous key", async () => {
      prismaMock.grant.findUnique.mockResolvedValue(
        mockGrant({ userId: "user-1", campaignId: 1, role: Role.head_master })
      );

      const result = await authorizeCampaignLogoCoverUpload(prismaClient, {
        userId: "user-1",
        userEmail: "user@example.com",
        campaignSlug: "test-campaign",
        field,
      });

      expect(result).toEqual({
        ok: true,
        context: {
          campaignId: 1,
          campaignSlug: "test-campaign",
          field,
          previousKey: `old-${field}-key`,
        },
      });
    });

    it("returns 403 for a hardcoded sviluppo email without a campaign grant (nessun bypass generico)", async () => {
      prismaMock.grant.findUnique.mockResolvedValue(null);

      const result = await authorizeCampaignLogoCoverUpload(prismaClient, {
        userId: "user-1",
        userEmail: "mattia@arcana.it",
        campaignSlug: "test-campaign",
        field,
      });

      expect(result).toEqual({
        ok: false,
        status: 403,
        message: "Permessi insufficienti",
      });
    });
  }
);

describe.each(["logo", "cover"] as const)(
  "applyCampaignLogoCoverUpload (%s)",
  field => {
    const context = (previousKey: string | null) => ({
      campaignId: 1,
      campaignSlug: "test-campaign",
      field,
      previousKey,
    });

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("persists the new file on its own column and cleans up the previous one", async () => {
      const updated = mockCampaign({
        id: 1,
        [field]: "https://utfs.io/f/new-key",
        [`${field}Key`]: "new-key",
      });
      prismaMock.campaign.update.mockResolvedValue(updated);
      const deleteFile = vi.fn().mockResolvedValue(undefined);

      const result = await applyCampaignLogoCoverUpload(
        prismaClient,
        context("old-key"),
        { url: "https://utfs.io/f/new-key", key: "new-key" },
        deleteFile
      );

      expect(result).toEqual(updated);
      expect(prismaMock.campaign.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          [field]: "https://utfs.io/f/new-key",
          [`${field}Key`]: "new-key",
        },
      });
      expect(deleteFile).toHaveBeenCalledWith("old-key");
    });

    it("does not attempt cleanup when there was no previous file", async () => {
      prismaMock.campaign.update.mockResolvedValue(mockCampaign({ id: 1 }));
      const deleteFile = vi.fn();

      await applyCampaignLogoCoverUpload(
        prismaClient,
        context(null),
        { url: "https://utfs.io/f/new-key", key: "new-key" },
        deleteFile
      );

      expect(deleteFile).not.toHaveBeenCalled();
    });

    it("does not attempt cleanup when the new file has the same key as the previous one", async () => {
      prismaMock.campaign.update.mockResolvedValue(mockCampaign({ id: 1 }));
      const deleteFile = vi.fn();

      await applyCampaignLogoCoverUpload(
        prismaClient,
        context("same-key"),
        { url: "https://utfs.io/f/same-key", key: "same-key" },
        deleteFile
      );

      expect(deleteFile).not.toHaveBeenCalled();
    });

    it("does not let a failed cleanup of the previous file fail the upload", async () => {
      const updated = mockCampaign({ id: 1 });
      prismaMock.campaign.update.mockResolvedValue(updated);
      const deleteFile = vi.fn().mockRejectedValue(new Error("network error"));
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const result = await applyCampaignLogoCoverUpload(
        prismaClient,
        context("old-key"),
        { url: "https://utfs.io/f/new-key", key: "new-key" },
        deleteFile
      );

      expect(result).toEqual(updated);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  }
);
