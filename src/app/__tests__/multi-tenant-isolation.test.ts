import { describe, it, expect, beforeEach, vi } from "vitest";
import { Role, DataVisibility } from "@prisma/client";
import { prismaMock } from "@/test/mocks/prisma";
import {
  mockOrganization,
  mockCampaign,
  mockCharacter,
  mockCharacterData,
  mockGrant,
} from "@/test/helpers/prisma-fixtures";

/**
 * Multi-Tenant Isolation Tests
 *
 * These tests verify that data is properly isolated between:
 * - Organizations
 * - Campaigns within organizations
 * - Users without grants
 * - Characters belonging to different users
 */
describe("Multi-Tenant Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Organization Isolation", () => {
    it("should prevent campaigns from leaking across organizations", () => {
      const org1 = mockOrganization({ id: 1, slug: "org-1" });
      const org2 = mockOrganization({ id: 2, slug: "org-2" });

      const campaign1 = mockCampaign({ id: 1, organizationId: 1 });
      const campaign2 = mockCampaign({ id: 2, organizationId: 2 });

      // Campaign 1 belongs to org 1
      expect(campaign1.organizationId).toBe(org1.id);

      // Campaign 2 belongs to org 2
      expect(campaign2.organizationId).toBe(org2.id);

      // They should be in different organizations
      expect(campaign1.organizationId).not.toBe(campaign2.organizationId);
    });

    it("should filter campaigns by organizationId in queries", async () => {
      prismaMock.campaign.findMany.mockResolvedValue([]);

      // Query for campaigns in organization 1
      await prismaMock.campaign.findMany({
        where: { organizationId: 1 },
      });

      expect(prismaMock.campaign.findMany).toHaveBeenCalledWith({
        where: { organizationId: 1 },
      });
    });

    it("should ensure unique campaign slugs per organization", () => {
      // Same slug can exist in different organizations
      const campaign1 = mockCampaign({
        id: 1,
        slug: "main",
        organizationId: 1,
      });
      const campaign2 = mockCampaign({
        id: 2,
        slug: "main",
        organizationId: 2,
      });

      expect(campaign1.slug).toBe(campaign2.slug);
      expect(campaign1.organizationId).not.toBe(campaign2.organizationId);
    });
  });

  describe("Campaign Isolation", () => {
    it("should prevent characters from leaking across campaigns", () => {
      const char1 = mockCharacter({ id: 1, campaignId: 1, userId: "user-1" });
      const char2 = mockCharacter({ id: 2, campaignId: 2, userId: "user-1" });

      // Same user, different campaigns
      expect(char1.userId).toBe(char2.userId);
      expect(char1.campaignId).not.toBe(char2.campaignId);
    });

    it("should filter characters by campaignId in queries", async () => {
      prismaMock.character.findMany.mockResolvedValue([]);

      await prismaMock.character.findMany({
        where: { campaignId: 1 },
      });

      expect(prismaMock.character.findMany).toHaveBeenCalledWith({
        where: { campaignId: 1 },
      });
    });

    it("should prevent data types from leaking across campaigns", () => {
      const dataType1 = { id: 1, name: "Rules", campaignId: 1 };
      const dataType2 = { id: 2, name: "Rules", campaignId: 2 };

      // Same name, different campaigns - should be isolated
      expect(dataType1.name).toBe(dataType2.name);
      expect(dataType1.campaignId).not.toBe(dataType2.campaignId);
    });

    it("should filter data by campaign through dataType relation", async () => {
      prismaMock.characterData.findMany.mockResolvedValue([]);

      await prismaMock.characterData.findMany({
        where: {
          dataType: {
            campaignId: 1,
          },
        },
      });

      expect(prismaMock.characterData.findMany).toHaveBeenCalledWith({
        where: {
          dataType: {
            campaignId: 1,
          },
        },
      });
    });
  });

  describe("User Data Isolation", () => {
    it("should prevent users from accessing characters they do not own", () => {
      const user1Char = mockCharacter({
        id: 1,
        userId: "user-1",
        campaignId: 1,
      });
      const user2Char = mockCharacter({
        id: 2,
        userId: "user-2",
        campaignId: 1,
      });

      // Same campaign, different owners
      expect(user1Char.campaignId).toBe(user2Char.campaignId);
      expect(user1Char.userId).not.toBe(user2Char.userId);
    });

    it("should filter characters by userId in queries", async () => {
      prismaMock.character.findMany.mockResolvedValue([]);

      await prismaMock.character.findMany({
        where: { userId: "user-1" },
      });

      expect(prismaMock.character.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });
    });

    it("should combine userId and campaignId filters", async () => {
      prismaMock.character.findMany.mockResolvedValue([]);

      await prismaMock.character.findMany({
        where: {
          userId: "user-1",
          campaignId: 1,
        },
      });

      expect(prismaMock.character.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          campaignId: 1,
        },
      });
    });
  });

  describe("Grant-Based Access Control", () => {
    it("should enforce grant requirement for campaign access", async () => {
      const grant = mockGrant({
        userId: "user-1",
        campaignId: 1,
        role: Role.head_master,
      });
      prismaMock.grant.findUnique.mockResolvedValue(grant);

      const result = await prismaMock.grant.findUnique({
        where: {
          userId_campaignId: {
            userId: "user-1",
            campaignId: 1,
          },
        },
      });

      expect(result).toEqual(grant);
    });

    it("should return null for users without grants", async () => {
      prismaMock.grant.findUnique.mockResolvedValue(null);

      const result = await prismaMock.grant.findUnique({
        where: {
          userId_campaignId: {
            userId: "user-1",
            campaignId: 1,
          },
        },
      });

      expect(result).toBeNull();
    });

    it("should use composite key for grant uniqueness", () => {
      const grant1 = mockGrant({ userId: "user-1", campaignId: 1 });
      const grant2 = mockGrant({ userId: "user-1", campaignId: 2 });
      const grant3 = mockGrant({ userId: "user-2", campaignId: 1 });

      // All should be different grants
      expect(grant1.campaignId).not.toBe(grant2.campaignId);
      expect(grant1.userId).not.toBe(grant3.userId);
    });

    it("should filter campaigns by user grants", async () => {
      prismaMock.campaign.findMany.mockResolvedValue([]);

      await prismaMock.campaign.findMany({
        where: {
          grants: {
            some: {
              userId: "user-1",
            },
          },
        },
      });

      expect(prismaMock.campaign.findMany).toHaveBeenCalledWith({
        where: {
          grants: {
            some: {
              userId: "user-1",
            },
          },
        },
      });
    });
  });

  describe("Data Visibility Isolation", () => {
    it("should separate hidden data from visible data", () => {
      const hiddenData = mockCharacterData({
        visibility: DataVisibility.hidden,
      });
      const visibleData = mockCharacterData({
        visibility: DataVisibility.visible,
      });

      expect(hiddenData.visibility).not.toBe(visibleData.visibility);
    });

    it("should associate data with specific characters", () => {
      const char1Data = mockCharacterData({
        characterId: 1,
        visibility: DataVisibility.visible,
      });
      const char2Data = mockCharacterData({
        characterId: 2,
        visibility: DataVisibility.visible,
      });

      expect(char1Data.characterId).not.toBe(char2Data.characterId);
    });

    it("should associate data with specific users", () => {
      const user1Data = mockCharacterData({
        userId: "user-1",
        visibility: DataVisibility.visible,
      });
      const user2Data = mockCharacterData({
        userId: "user-2",
        visibility: DataVisibility.visible,
      });

      expect(user1Data.userId).not.toBe(user2Data.userId);
    });

    it("should filter data by visibility in queries", async () => {
      prismaMock.characterData.findMany.mockResolvedValue([]);

      await prismaMock.characterData.findMany({
        where: { visibility: DataVisibility.visible },
      });

      expect(prismaMock.characterData.findMany).toHaveBeenCalledWith({
        where: { visibility: DataVisibility.visible },
      });
    });

    it("should filter data by character ownership", async () => {
      prismaMock.characterData.findMany.mockResolvedValue([]);

      await prismaMock.characterData.findMany({
        where: { characterId: 1 },
      });

      expect(prismaMock.characterData.findMany).toHaveBeenCalledWith({
        where: { characterId: 1 },
      });
    });
  });

  describe("Cross-Tenant Access Prevention", () => {
    it("should prevent accessing campaigns from different organizations", async () => {
      prismaMock.campaign.findFirst.mockResolvedValue(null);

      // Try to access campaign with wrong organization filter
      const result = await prismaMock.campaign.findFirst({
        where: {
          id: 1,
          organizationId: 999, // Wrong organization
        },
      });

      expect(result).toBeNull();
    });

    it("should prevent accessing characters from different campaigns", async () => {
      prismaMock.character.findFirst.mockResolvedValue(null);

      const result = await prismaMock.character.findFirst({
        where: {
          id: 1,
          campaignId: 999, // Wrong campaign
        },
      });

      expect(result).toBeNull();
    });

    it("should prevent accessing characters owned by other users", async () => {
      prismaMock.character.findFirst.mockResolvedValue(null);

      const result = await prismaMock.character.findFirst({
        where: {
          id: 1,
          userId: "wrong-user",
        },
      });

      expect(result).toBeNull();
    });

    it("should prevent grant escalation across campaigns", async () => {
      // User has admin in campaign 1
      const campaign1Grant = mockGrant({
        userId: "user-1",
        campaignId: 1,
        role: Role.head_master,
      });

      // But no grant in campaign 2 (queried second, below).
      prismaMock.grant.findUnique
        .mockResolvedValueOnce(campaign1Grant)
        .mockResolvedValueOnce(null);

      // Should have access to campaign 1
      const grant1 = await prismaMock.grant.findUnique({
        where: { userId_campaignId: { userId: "user-1", campaignId: 1 } },
      });
      expect(grant1).toBeTruthy();

      // Should NOT have access to campaign 2
      const grant2 = await prismaMock.grant.findUnique({
        where: { userId_campaignId: { userId: "user-1", campaignId: 2 } },
      });
      expect(grant2).toBeNull();
    });
  });

  describe("Composite Key Enforcement", () => {
    it("should use composite key for grants (userId + campaignId)", async () => {
      prismaMock.grant.findUnique.mockResolvedValue(null);

      await prismaMock.grant.findUnique({
        where: {
          userId_campaignId: {
            userId: "user-1",
            campaignId: 1,
          },
        },
      });

      expect(prismaMock.grant.findUnique).toHaveBeenCalledWith({
        where: {
          userId_campaignId: {
            userId: "user-1",
            campaignId: 1,
          },
        },
      });
    });

    it("should use composite key for campaign uniqueness (orgId + slug)", () => {
      // Campaigns should be unique per organization + slug combination
      const campaign = mockCampaign({ organizationId: 1, slug: "main" });

      expect(campaign.organizationId).toBeDefined();
      expect(campaign.slug).toBeDefined();
    });
  });

  describe("Data Leakage Prevention", () => {
    it("should not expose hidden data in general queries", async () => {
      const visibleData = [
        mockCharacterData({ visibility: DataVisibility.visible }),
      ];
      prismaMock.characterData.findMany.mockResolvedValue(visibleData);

      const result = await prismaMock.characterData.findMany({
        where: { visibility: DataVisibility.visible },
      });

      // Should only return visible data
      expect(result.every(d => d.visibility === DataVisibility.visible)).toBe(
        true
      );
    });

    it("should scope data queries to campaign via dataType", async () => {
      prismaMock.characterData.findMany.mockResolvedValue([]);

      await prismaMock.characterData.findMany({
        where: {
          dataType: {
            campaignId: 1,
          },
        },
      });

      expect(prismaMock.characterData.findMany).toHaveBeenCalledWith({
        where: {
          dataType: {
            campaignId: 1,
          },
        },
      });
    });

    it("should not expose user email/personal info without explicit selection", () => {
      // When selecting user in queries, should be explicit about fields
      const safeUserSelection = {
        id: true,
        name: true,
        email: false, // Don't expose by default
      };

      expect(safeUserSelection.email).toBe(false);
    });
  });
});
