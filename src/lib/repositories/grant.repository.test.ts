import { describe, it, expect, beforeEach, vi } from "vitest";
import { Role } from "@prisma/client";
import {
  createGrant,
  updateGrantRole,
  revokeGrant,
  listGrantsForCampaign,
  getMasterCampaignSlugs,
} from "./grant.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import { mockGrant, mockUser } from "@/test/helpers/prisma-fixtures";

describe("Grant Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createGrant", () => {
    it("should create a grant with the provided role", async () => {
      const grant = { ...mockGrant(), user: mockUser() };
      prismaMock.grant.create.mockResolvedValue(grant);

      const result = await createGrant(prismaClient, {
        userId: "user-1",
        campaignId: 1,
        role: Role.master,
      });

      expect(result).toEqual(grant);
      expect(prismaMock.grant.create).toHaveBeenCalledWith({
        data: { userId: "user-1", campaignId: 1, role: Role.master },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      });
    });
  });

  describe("updateGrantRole", () => {
    it("should update the role for the composite key", async () => {
      const grant = {
        ...mockGrant({ role: Role.supporter }),
        user: mockUser(),
      };
      prismaMock.grant.update.mockResolvedValue(grant);

      const result = await updateGrantRole(
        prismaClient,
        "user-1",
        1,
        Role.supporter
      );

      expect(result).toEqual(grant);
      expect(prismaMock.grant.update).toHaveBeenCalledWith({
        where: { userId_campaignId: { userId: "user-1", campaignId: 1 } },
        data: { role: Role.supporter },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      });
    });

    it("should throw when the grant does not exist", async () => {
      prismaMock.grant.update.mockRejectedValue(new Error("Record not found"));

      await expect(
        updateGrantRole(prismaClient, "user-1", 999, Role.master)
      ).rejects.toThrow("Record not found");
    });
  });

  describe("revokeGrant", () => {
    it("should delete the grant for the composite key", async () => {
      const grant = mockGrant();
      prismaMock.grant.delete.mockResolvedValue(grant);

      const result = await revokeGrant(prismaClient, "user-1", 1);

      expect(result).toEqual(grant);
      expect(prismaMock.grant.delete).toHaveBeenCalledWith({
        where: { userId_campaignId: { userId: "user-1", campaignId: 1 } },
      });
    });

    it("should throw when the grant does not exist", async () => {
      prismaMock.grant.delete.mockRejectedValue(new Error("Record not found"));

      await expect(revokeGrant(prismaClient, "user-1", 999)).rejects.toThrow(
        "Record not found"
      );
    });
  });

  describe("listGrantsForCampaign", () => {
    it("should list grants scoped to the campaign", async () => {
      const grants = [
        {
          ...mockGrant({ userId: "user-1", campaignId: 1 }),
          user: mockUser({ id: "user-1" }),
        },
        {
          ...mockGrant({
            userId: "user-2",
            campaignId: 1,
            role: Role.supporter,
          }),
          user: mockUser({ id: "user-2" }),
        },
      ];
      prismaMock.grant.findMany.mockResolvedValue(grants);

      const result = await listGrantsForCampaign(prismaClient, 1);

      expect(result).toEqual(grants);
      expect(prismaMock.grant.findMany).toHaveBeenCalledWith({
        where: { campaignId: 1 },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { user: { name: "asc" } },
      });
    });

    it("should not leak grants from another campaign", async () => {
      prismaMock.grant.findMany.mockResolvedValue([]);

      await listGrantsForCampaign(prismaClient, 2);

      expect(prismaMock.grant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { campaignId: 2 } })
      );
    });

    it("should return an empty array when the campaign has no grants", async () => {
      prismaMock.grant.findMany.mockResolvedValue([]);

      const result = await listGrantsForCampaign(prismaClient, 1);

      expect(result).toEqual([]);
    });
  });

  describe("getMasterCampaignSlugs", () => {
    it("should return the slugs of campaigns where the user is master or head_master", async () => {
      prismaMock.grant.findMany.mockResolvedValue([
        { campaign: { slug: "campaign-a" } },
        { campaign: { slug: "campaign-b" } },
      ] as never);

      const result = await getMasterCampaignSlugs(prismaClient, "user-1");

      expect(result).toEqual(["campaign-a", "campaign-b"]);
      expect(prismaMock.grant.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          role: { in: [Role.head_master, Role.master] },
        },
        select: { campaign: { select: { slug: true } } },
      });
    });

    it("should return an empty array when the user has no master or head_master grant", async () => {
      prismaMock.grant.findMany.mockResolvedValue([]);

      const result = await getMasterCampaignSlugs(prismaClient, "user-1");

      expect(result).toEqual([]);
    });
  });
});
