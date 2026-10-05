/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { Role } from "@prisma/client";
import {
  checkCampaignAccess,
  getUserAccessibleCampaigns,
  isUserCampaignAdmin,
  isUserCampaignMaster,
  isUserCampaignHelper,
  getUserCampaignRole,
  isOrganizationHeadMaster,
  hasValidMembershipForYear,
  checkAssociationQuotaAccess,
  getCurrentAssociationYear,
  HARDCODED_SVILUPPO_EMAILS,
  isHardcodedSviluppo,
  getUserGroupFlags,
  hasAdminSectionAccess,
  canManageEvents,
  requireCampaignAdminBySlug,
  requireCampaignMasterBySlug,
} from "./authorization";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockGrant,
  mockUser,
  mockMembership,
  mockCampaign,
  mockOrganization,
} from "@/test/helpers/prisma-fixtures";
// `vi.mock` is hoisted above imports; this always resolves to the mocked module.
import { auth } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

describe("Authorization Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkCampaignAccess", () => {
    it("should return true for admin role with any required role", async () => {
      const grant = mockGrant({ role: Role.head_master });
      prismaMock.grant.findUnique.mockResolvedValue(grant);

      const result = await checkCampaignAccess(
        prismaClient,
        "user-1",
        1,
        Role.supporter
      );

      expect(result).toBe(true);
      expect(prismaMock.grant.findUnique).toHaveBeenCalledWith({
        where: {
          userId_campaignId: {
            userId: "user-1",
            campaignId: 1,
          },
        },
      });
    });

    it("should return true for helper role when helper is required", async () => {
      const grant = mockGrant({ role: Role.supporter });
      prismaMock.grant.findUnique.mockResolvedValue(grant);

      const result = await checkCampaignAccess(
        prismaClient,
        "user-1",
        1,
        Role.supporter
      );

      expect(result).toBe(true);
    });

    it("should return false for helper role when admin is required", async () => {
      const grant = mockGrant({ role: Role.supporter });
      prismaMock.grant.findUnique.mockResolvedValue(grant);

      const result = await checkCampaignAccess(
        prismaClient,
        "user-1",
        1,
        Role.head_master
      );

      expect(result).toBe(false);
    });

    it("should return false when user has no grant", async () => {
      prismaMock.grant.findUnique.mockResolvedValue(null);

      const result = await checkCampaignAccess(
        prismaClient,
        "user-1",
        1,
        Role.supporter
      );

      expect(result).toBe(false);
    });

    it("should return true when no specific role is required and grant exists", async () => {
      const grant = mockGrant({ role: Role.supporter });
      prismaMock.grant.findUnique.mockResolvedValue(grant);

      const result = await checkCampaignAccess(prismaClient, "user-1", 1);

      expect(result).toBe(true);
    });

    it("should return false when no specific role is required but no grant exists", async () => {
      prismaMock.grant.findUnique.mockResolvedValue(null);

      const result = await checkCampaignAccess(prismaClient, "user-1", 1);

      expect(result).toBe(false);
    });

    it("should use composite key for grant lookup", async () => {
      prismaMock.grant.findUnique.mockResolvedValue(null);

      await checkCampaignAccess(
        prismaClient,
        "user-123",
        456,
        Role.head_master
      );

      expect(prismaMock.grant.findUnique).toHaveBeenCalledWith({
        where: {
          userId_campaignId: {
            userId: "user-123",
            campaignId: 456,
          },
        },
      });
    });

    it("should enforce multi-tenant isolation (different campaign)", async () => {
      prismaMock.grant.findUnique.mockResolvedValue(null);

      const result = await checkCampaignAccess(prismaClient, "user-1", 999);

      expect(result).toBe(false);
      expect(prismaMock.grant.findUnique).toHaveBeenCalledWith({
        where: {
          userId_campaignId: {
            userId: "user-1",
            campaignId: 999,
          },
        },
      });
    });
  });

  describe("getUserAccessibleCampaigns", () => {
    it("should return all campaign IDs user has grants for", async () => {
      const grants = [
        mockGrant({ campaignId: 1 }),
        mockGrant({ campaignId: 2 }),
        mockGrant({ campaignId: 3 }),
      ];
      prismaMock.grant.findMany.mockResolvedValue(grants);

      const result = await getUserAccessibleCampaigns(prismaClient, "user-1");

      expect(result).toEqual([1, 2, 3]);
      expect(prismaMock.grant.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        select: { campaignId: true },
      });
    });

    it("should return empty array when user has no grants", async () => {
      prismaMock.grant.findMany.mockResolvedValue([]);

      const result = await getUserAccessibleCampaigns(prismaClient, "user-1");

      expect(result).toEqual([]);
    });

    it("should only select campaignId for efficiency", async () => {
      prismaMock.grant.findMany.mockResolvedValue([]);

      await getUserAccessibleCampaigns(prismaClient, "user-1");

      expect(prismaMock.grant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { campaignId: true },
        })
      );
    });

    it("should filter by userId", async () => {
      prismaMock.grant.findMany.mockResolvedValue([]);

      await getUserAccessibleCampaigns(prismaClient, "specific-user-id");

      expect(prismaMock.grant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "specific-user-id" },
        })
      );
    });
  });

  describe("isUserCampaignAdmin", () => {
    it("should return true when user has admin role", async () => {
      const grant = mockGrant({ role: Role.head_master });
      prismaMock.grant.findUnique.mockResolvedValue(grant);

      const result = await isUserCampaignAdmin(prismaClient, "user-1", 1);

      expect(result).toBe(true);
    });

    it("should return false when user has helper role", async () => {
      const grant = mockGrant({ role: Role.supporter });
      prismaMock.grant.findUnique.mockResolvedValue(grant);

      const result = await isUserCampaignAdmin(prismaClient, "user-1", 1);

      expect(result).toBe(false);
    });

    it("should return false when user has no grant", async () => {
      prismaMock.grant.findUnique.mockResolvedValue(null);

      const result = await isUserCampaignAdmin(prismaClient, "user-1", 1);

      expect(result).toBe(false);
    });
  });

  describe("isUserCampaignMaster", () => {
    it("should return true when user has master role", async () => {
      const grant = mockGrant({ role: Role.master });
      prismaMock.grant.findUnique.mockResolvedValue(grant);

      const result = await isUserCampaignMaster(prismaClient, "user-1", 1);

      expect(result).toBe(true);
    });

    it("should return true when user has head_master role (head_master ⊇ master)", async () => {
      const grant = mockGrant({ role: Role.head_master });
      prismaMock.grant.findUnique.mockResolvedValue(grant);

      const result = await isUserCampaignMaster(prismaClient, "user-1", 1);

      expect(result).toBe(true);
    });

    it("should return false when user has only supporter role", async () => {
      const grant = mockGrant({ role: Role.supporter });
      prismaMock.grant.findUnique.mockResolvedValue(grant);

      const result = await isUserCampaignMaster(prismaClient, "user-1", 1);

      expect(result).toBe(false);
    });

    it("should return false when user has no grant", async () => {
      prismaMock.grant.findUnique.mockResolvedValue(null);

      const result = await isUserCampaignMaster(prismaClient, "user-1", 1);

      expect(result).toBe(false);
    });
  });

  describe("isUserCampaignHelper", () => {
    it("should return true when user has admin role", async () => {
      const grant = mockGrant({ role: Role.head_master });
      prismaMock.grant.findUnique.mockResolvedValue(grant);

      const result = await isUserCampaignHelper(prismaClient, "user-1", 1);

      expect(result).toBe(true);
    });

    it("should return true when user has helper role", async () => {
      const grant = mockGrant({ role: Role.supporter });
      prismaMock.grant.findUnique.mockResolvedValue(grant);

      const result = await isUserCampaignHelper(prismaClient, "user-1", 1);

      expect(result).toBe(true);
    });

    it("should return false when user has no grant", async () => {
      prismaMock.grant.findUnique.mockResolvedValue(null);

      const result = await isUserCampaignHelper(prismaClient, "user-1", 1);

      expect(result).toBe(false);
    });

    it("should verify helper permissions are hierarchical (admin ⊇ helper)", async () => {
      // Admin has helper permissions
      const adminGrant = mockGrant({ role: Role.head_master });
      prismaMock.grant.findUnique.mockResolvedValue(adminGrant);

      const adminResult = await isUserCampaignHelper(prismaClient, "user-1", 1);
      expect(adminResult).toBe(true);

      // Helper has helper permissions
      const helperGrant = mockGrant({ role: Role.supporter });
      prismaMock.grant.findUnique.mockResolvedValue(helperGrant);

      const helperResult = await isUserCampaignHelper(
        prismaClient,
        "user-1",
        1
      );
      expect(helperResult).toBe(true);
    });
  });

  describe("isOrganizationHeadMaster", () => {
    it("should return true when user is head_master of a campaign in the organization", async () => {
      const grant = mockGrant({ role: Role.head_master });
      prismaMock.grant.findFirst.mockResolvedValue(grant);

      const result = await isOrganizationHeadMaster(prismaClient, "user-1", 1);

      expect(result).toBe(true);
      expect(prismaMock.grant.findFirst).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          role: Role.head_master,
          campaign: { organizationId: 1 },
        },
      });
    });

    it("should return false when user has no head_master grant in the organization", async () => {
      prismaMock.grant.findFirst.mockResolvedValue(null);

      const result = await isOrganizationHeadMaster(prismaClient, "user-1", 1);

      expect(result).toBe(false);
    });

    it("should not leak head_master status across organizations", async () => {
      // User is head_master in organization 1, not in organization 2.
      prismaMock.grant.findFirst
        .mockResolvedValueOnce(mockGrant({ role: Role.head_master }))
        .mockResolvedValueOnce(null);

      const org1Result = await isOrganizationHeadMaster(
        prismaClient,
        "user-1",
        1
      );
      const org2Result = await isOrganizationHeadMaster(
        prismaClient,
        "user-1",
        2
      );

      expect(org1Result).toBe(true);
      expect(org2Result).toBe(false);
    });
  });

  describe("getUserCampaignRole", () => {
    it("should return admin role when user has admin grant", async () => {
      const grant = mockGrant({ role: Role.head_master });
      prismaMock.grant.findUnique.mockResolvedValue(grant);

      const result = await getUserCampaignRole(prismaClient, "user-1", 1);

      expect(result).toBe(Role.head_master);
    });

    it("should return helper role when user has helper grant", async () => {
      const grant = mockGrant({ role: Role.supporter });
      prismaMock.grant.findUnique.mockResolvedValue(grant);

      const result = await getUserCampaignRole(prismaClient, "user-1", 1);

      expect(result).toBe(Role.supporter);
    });

    it("should return null when user has no grant", async () => {
      prismaMock.grant.findUnique.mockResolvedValue(null);

      const result = await getUserCampaignRole(prismaClient, "user-1", 1);

      expect(result).toBeNull();
    });

    it("should use composite key for lookup", async () => {
      prismaMock.grant.findUnique.mockResolvedValue(null);

      await getUserCampaignRole(prismaClient, "user-abc", 789);

      expect(prismaMock.grant.findUnique).toHaveBeenCalledWith({
        where: {
          userId_campaignId: {
            userId: "user-abc",
            campaignId: 789,
          },
        },
      });
    });
  });

  describe("Role Hierarchy Tests", () => {
    it("should enforce admin has all permissions", async () => {
      const grant = mockGrant({ role: Role.head_master });
      prismaMock.grant.findUnique.mockResolvedValue(grant);

      // Admin should pass admin check
      const adminCheck = await checkCampaignAccess(
        prismaClient,
        "user-1",
        1,
        Role.head_master
      );
      expect(adminCheck).toBe(true);

      // Admin should pass helper check
      const helperCheck = await checkCampaignAccess(
        prismaClient,
        "user-1",
        1,
        Role.supporter
      );
      expect(helperCheck).toBe(true);
    });

    it("should enforce helper has limited permissions", async () => {
      const grant = mockGrant({ role: Role.supporter });
      prismaMock.grant.findUnique.mockResolvedValue(grant);

      // Helper should fail admin check
      const adminCheck = await checkCampaignAccess(
        prismaClient,
        "user-1",
        1,
        Role.head_master
      );
      expect(adminCheck).toBe(false);

      // Helper should pass helper check
      const helperCheck = await checkCampaignAccess(
        prismaClient,
        "user-1",
        1,
        Role.supporter
      );
      expect(helperCheck).toBe(true);
    });
  });

  describe("Multi-Tenant Isolation Tests", () => {
    it("should not allow cross-campaign access", async () => {
      // User has access to campaign 1
      const grant = mockGrant({ userId: "user-1", campaignId: 1 });
      // Called first for campaign 1, then for campaign 2 (below).
      prismaMock.grant.findUnique
        .mockResolvedValueOnce(grant)
        .mockResolvedValueOnce(null);

      // Should have access to campaign 1
      const campaign1Access = await checkCampaignAccess(
        prismaClient,
        "user-1",
        1
      );
      expect(campaign1Access).toBe(true);

      // Should NOT have access to campaign 2
      const campaign2Access = await checkCampaignAccess(
        prismaClient,
        "user-1",
        2
      );
      expect(campaign2Access).toBe(false);
    });

    it("should isolate users within same campaign", async () => {
      // User 1 has access
      const user1Grant = mockGrant({ userId: "user-1", campaignId: 1 });
      // Called first for user-1, then for user-2 (below).
      prismaMock.grant.findUnique
        .mockResolvedValueOnce(user1Grant)
        .mockResolvedValueOnce(null);

      // User 1 should have access
      const user1Access = await checkCampaignAccess(prismaClient, "user-1", 1);
      expect(user1Access).toBe(true);

      // User 2 should NOT have access (no grant)
      const user2Access = await checkCampaignAccess(prismaClient, "user-2", 1);
      expect(user2Access).toBe(false);
    });

    it("should track accessible campaigns per user", async () => {
      // User 1 has access to campaigns 1 and 2; called first for user-1, then for user-2 (below).
      prismaMock.grant.findMany
        .mockResolvedValueOnce([
          mockGrant({ userId: "user-1", campaignId: 1 }),
          mockGrant({ userId: "user-1", campaignId: 2 }),
        ])
        .mockResolvedValueOnce([]);

      const user1Campaigns = await getUserAccessibleCampaigns(
        prismaClient,
        "user-1"
      );
      expect(user1Campaigns).toEqual([1, 2]);

      const user2Campaigns = await getUserAccessibleCampaigns(
        prismaClient,
        "user-2"
      );
      expect(user2Campaigns).toEqual([]);
    });
  });

  describe("isHardcodedSviluppo / HARDCODED_SVILUPPO_EMAILS", () => {
    it.each(HARDCODED_SVILUPPO_EMAILS)(
      "should return true for the cabled email %s",
      email => {
        expect(isHardcodedSviluppo(email)).toBe(true);
      }
    );

    it("should return false for any other email", () => {
      expect(isHardcodedSviluppo("not-admin@example.com")).toBe(false);
    });
  });

  describe("getUserGroupFlags", () => {
    it("should return the flags as stored for a plain user", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "not-admin@example.com" })
      );

      const result = await getUserGroupFlags(prismaClient, "user-1");

      expect(result).toEqual({ isDirettivo: false, isSviluppo: false });
    });

    it("should reflect isDirettivo=true from the DB", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "not-admin@example.com", isDirettivo: true })
      );

      const result = await getUserGroupFlags(prismaClient, "user-1");

      expect(result).toEqual({ isDirettivo: true, isSviluppo: false });
    });

    it("should force isSviluppo=true for a cabled email even if the DB flag is false", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "mattia@arcana.it", isSviluppo: false })
      );

      const result = await getUserGroupFlags(prismaClient, "user-1");

      expect(result).toEqual({ isDirettivo: false, isSviluppo: true });
    });

    it("should return null when the user does not exist", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await getUserGroupFlags(prismaClient, "ghost");

      expect(result).toBeNull();
    });
  });

  describe("hasAdminSectionAccess", () => {
    it("should allow a direttivo member", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "not-admin@example.com", isDirettivo: true })
      );

      expect(await hasAdminSectionAccess(prismaClient, "user-1")).toBe(true);
    });

    it("should allow a sviluppo member", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "not-admin@example.com", isSviluppo: true })
      );

      expect(await hasAdminSectionAccess(prismaClient, "user-1")).toBe(true);
    });

    it("should allow a cabled sviluppo email even without the DB flag", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "mattia@arcana.it" })
      );

      expect(await hasAdminSectionAccess(prismaClient, "user-1")).toBe(true);
    });

    it("should block a plain user", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "not-admin@example.com" })
      );

      expect(await hasAdminSectionAccess(prismaClient, "user-1")).toBe(false);
    });

    it("should block when the user does not exist", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      expect(await hasAdminSectionAccess(prismaClient, "ghost")).toBe(false);
    });
  });

  describe("canManageEvents", () => {
    it("should allow a direttivo member to manage an event without a campaign", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "president@example.com", isDirettivo: true })
      );

      expect(await canManageEvents(prismaClient, "user-1", null)).toBe(true);
    });

    it("should NOT allow a direttivo member (not sviluppo) to manage an event of a specific campaign without a grant there", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "president@example.com", isDirettivo: true })
      );
      prismaMock.grant.findUnique.mockResolvedValue(null);

      expect(await canManageEvents(prismaClient, "user-1", 1)).toBe(false);
    });

    it("should allow a sviluppo member to manage an event of any campaign, even without a grant there", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "mattia@arcana.it" })
      );

      expect(await canManageEvents(prismaClient, "user-1", 1)).toBe(true);
    });

    it("should allow a plain user who is master of the event's campaign", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "master@example.com" })
      );
      prismaMock.grant.findUnique.mockResolvedValue(
        mockGrant({ userId: "user-1", campaignId: 1, role: Role.master })
      );

      expect(await canManageEvents(prismaClient, "user-1", 1)).toBe(true);
    });

    it("should block a plain user with no grant on the event's campaign", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "nobody@example.com" })
      );
      prismaMock.grant.findUnique.mockResolvedValue(null);

      expect(await canManageEvents(prismaClient, "user-1", 1)).toBe(false);
    });

    it("should block a plain user from managing an event without a campaign", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "nobody@example.com" })
      );

      expect(await canManageEvents(prismaClient, "user-1", null)).toBe(false);
    });
  });

  describe("getCurrentAssociationYear", () => {
    it("should anchor the year to Europe/Rome rather than the server's local/UTC time", () => {
      // 31/12 23:30 UTC è già 00:30 CET del 1° gennaio: un server in UTC che
      // usasse `Date.getFullYear()` calcolerebbe l'anno sbagliato.
      const newYearEveUtc = new Date("2025-12-31T23:30:00.000Z");

      expect(getCurrentAssociationYear(newYearEveUtc)).toBe(2026);
      expect(newYearEveUtc.getUTCFullYear()).toBe(2025);
    });

    it("should default to the current instant when no reference date is provided", () => {
      const expected = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Rome",
        year: "numeric",
      }).format(new Date());

      expect(getCurrentAssociationYear()).toBe(Number(expected));
    });
  });

  describe("hasValidMembershipForYear", () => {
    it("should return true when a membership exists for the given year", async () => {
      const membership = mockMembership({ userId: "user-1", year: 2026 });
      prismaMock.membership.findUnique.mockResolvedValue(membership);

      const result = await hasValidMembershipForYear(
        prismaClient,
        "user-1",
        2026
      );

      expect(result).toBe(true);
      expect(prismaMock.membership.findUnique).toHaveBeenCalledWith({
        where: { userId_year: { userId: "user-1", year: 2026 } },
      });
    });

    it("should return false when no membership exists for the given year", async () => {
      prismaMock.membership.findUnique.mockResolvedValue(null);

      const result = await hasValidMembershipForYear(
        prismaClient,
        "user-1",
        2026
      );

      expect(result).toBe(false);
    });

    it("should default to the current year when none is provided", async () => {
      prismaMock.membership.findUnique.mockResolvedValue(null);

      await hasValidMembershipForYear(prismaClient, "user-1");

      expect(prismaMock.membership.findUnique).toHaveBeenCalledWith({
        where: {
          userId_year: { userId: "user-1", year: getCurrentAssociationYear() },
        },
      });
    });
  });

  describe("checkAssociationQuotaAccess (quota OR isDirettivo/isSviluppo)", () => {
    it("should block a user without a valid membership and without an eligible flag", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "not-admin@example.com" })
      );
      prismaMock.membership.findUnique.mockResolvedValue(null);

      const result = await checkAssociationQuotaAccess(prismaClient, "user-1");

      expect(result).toBe(false);
    });

    it("should allow a user with a valid membership for the current year", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "member@example.com" })
      );
      prismaMock.membership.findUnique.mockResolvedValue(
        mockMembership({ userId: "user-1", year: getCurrentAssociationYear() })
      );

      const result = await checkAssociationQuotaAccess(prismaClient, "user-1");

      expect(result).toBe(true);
    });

    it("should allow a direttivo member even without a membership", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "president@example.com", isDirettivo: true })
      );
      prismaMock.membership.findUnique.mockResolvedValue(null);

      const result = await checkAssociationQuotaAccess(prismaClient, "user-1");

      expect(result).toBe(true);
      // Il bypass da direttivo/sviluppo evita del tutto la query sulla Membership.
      expect(prismaMock.membership.findUnique).not.toHaveBeenCalled();
    });

    it("should allow a cabled sviluppo email even without a membership or the DB flag", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "mattia@arcana.it" })
      );
      prismaMock.membership.findUnique.mockResolvedValue(null);

      const result = await checkAssociationQuotaAccess(
        prismaClient,
        "sviluppo-1"
      );

      expect(result).toBe(true);
      expect(prismaMock.membership.findUnique).not.toHaveBeenCalled();
    });

    it("should block when the user does not exist", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.membership.findUnique.mockResolvedValue(null);

      const result = await checkAssociationQuotaAccess(prismaClient, "ghost");

      expect(result).toBe(false);
    });
  });

  describe("requireCampaignAdminBySlug", () => {
    const campaignA = {
      ...mockCampaign({ id: 1, slug: "campaign-a" }),
      organization: mockOrganization(),
    };
    const campaignB = {
      ...mockCampaign({ id: 2, slug: "campaign-b" }),
      organization: mockOrganization(),
    };

    it("should return 401 when there is no session", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

      const result = await requireCampaignAdminBySlug(
        prismaClient,
        new Headers(),
        "campaign-a",
        "test-org"
      );

      expect(result).toEqual({
        ok: false,
        status: 401,
        error: "Non autenticato",
      });
    });

    it("should return 404 when the campaign slug does not resolve", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "u@x" },
      });
      prismaMock.campaign.findFirst.mockResolvedValue(null);

      const result = await requireCampaignAdminBySlug(
        prismaClient,
        new Headers(),
        "unknown-slug",
        "test-org"
      );

      expect(result).toEqual({
        ok: false,
        status: 404,
        error: "Campagna non trovata",
      });
    });

    it("should return 403 when the user has no admin grant on the campaign", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "u@x" },
      });
      prismaMock.campaign.findFirst.mockResolvedValue(campaignA);
      prismaMock.grant.findUnique.mockResolvedValue(null);

      const result = await requireCampaignAdminBySlug(
        prismaClient,
        new Headers(),
        "campaign-a",
        "test-org"
      );

      expect(result).toEqual({
        ok: false,
        status: 403,
        error: "Permessi insufficienti",
      });
    });

    it("should return ok when the user is head_master of the campaign", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "u@x" },
      });
      prismaMock.campaign.findFirst.mockResolvedValue(campaignA);
      prismaMock.grant.findUnique.mockResolvedValue(
        mockGrant({ userId: "user-1", campaignId: 1, role: Role.head_master })
      );

      const result = await requireCampaignAdminBySlug(
        prismaClient,
        new Headers(),
        "campaign-a",
        "test-org"
      );

      expect(result).toEqual({
        ok: true,
        campaign: campaignA,
        userId: "user-1",
        role: Role.head_master,
        isSviluppo: false,
      });
    });

    it("should return 403 for a user with no grant at all, even a hardcoded sviluppo email (nessun bypass generico)", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "mattia@arcana.it" },
      });
      prismaMock.campaign.findFirst.mockResolvedValue(campaignA);
      prismaMock.grant.findUnique.mockResolvedValue(null);

      const result = await requireCampaignAdminBySlug(
        prismaClient,
        new Headers(),
        "campaign-a",
        "test-org"
      );

      expect(result).toEqual({
        ok: false,
        status: 403,
        error: "Permessi insufficienti",
      });
    });

    it("should not let a campaign A admin manage campaign B's grants (cross-tenant)", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "u@x" },
      });
      // User 1 is head_master of campaign A only.
      prismaMock.campaign.findFirst.mockResolvedValue(campaignB);
      prismaMock.grant.findUnique.mockResolvedValue(null);

      const result = await requireCampaignAdminBySlug(
        prismaClient,
        new Headers(),
        "campaign-b",
        "test-org"
      );

      expect(result).toEqual({
        ok: false,
        status: 403,
        error: "Permessi insufficienti",
      });
    });
  });

  describe("requireCampaignMasterBySlug", () => {
    const campaignA = {
      ...mockCampaign({ id: 1, slug: "campaign-a" }),
      organization: mockOrganization(),
    };

    it("should return 401 when there is no session", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

      const result = await requireCampaignMasterBySlug(
        prismaClient,
        new Headers(),
        "campaign-a",
        "test-org"
      );

      expect(result).toEqual({
        ok: false,
        status: 401,
        error: "Non autenticato",
      });
    });

    it("should return 404 when the campaign slug does not resolve", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "u@x" },
      });
      prismaMock.campaign.findFirst.mockResolvedValue(null);

      const result = await requireCampaignMasterBySlug(
        prismaClient,
        new Headers(),
        "unknown-slug",
        "test-org"
      );

      expect(result).toEqual({
        ok: false,
        status: 404,
        error: "Campagna non trovata",
      });
    });

    it("should return 403 when the user only has the supporter role", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "u@x" },
      });
      prismaMock.campaign.findFirst.mockResolvedValue(campaignA);
      prismaMock.grant.findUnique.mockResolvedValue(
        mockGrant({ userId: "user-1", campaignId: 1, role: Role.supporter })
      );

      const result = await requireCampaignMasterBySlug(
        prismaClient,
        new Headers(),
        "campaign-a",
        "test-org"
      );

      expect(result).toEqual({
        ok: false,
        status: 403,
        error: "Permessi insufficienti",
      });
    });

    it("should return ok when the user is master of the campaign", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "u@x" },
      });
      prismaMock.campaign.findFirst.mockResolvedValue(campaignA);
      prismaMock.grant.findUnique.mockResolvedValue(
        mockGrant({ userId: "user-1", campaignId: 1, role: Role.master })
      );

      const result = await requireCampaignMasterBySlug(
        prismaClient,
        new Headers(),
        "campaign-a",
        "test-org"
      );

      expect(result).toEqual({
        ok: true,
        campaign: campaignA,
        userId: "user-1",
        role: Role.master,
        isSviluppo: false,
      });
    });

    it("should return ok when the user is head_master of the campaign (head_master ⊇ master)", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "u@x" },
      });
      prismaMock.campaign.findFirst.mockResolvedValue(campaignA);
      prismaMock.grant.findUnique.mockResolvedValue(
        mockGrant({ userId: "user-1", campaignId: 1, role: Role.head_master })
      );

      const result = await requireCampaignMasterBySlug(
        prismaClient,
        new Headers(),
        "campaign-a",
        "test-org"
      );

      expect(result).toEqual({
        ok: true,
        campaign: campaignA,
        userId: "user-1",
        role: Role.head_master,
        isSviluppo: false,
      });
    });

    it("should return 403 for a hardcoded sviluppo email without a grant (nessun bypass generico)", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "mattia@arcana.it" },
      });
      prismaMock.campaign.findFirst.mockResolvedValue(campaignA);
      prismaMock.grant.findUnique.mockResolvedValue(null);

      const result = await requireCampaignMasterBySlug(
        prismaClient,
        new Headers(),
        "campaign-a",
        "test-org"
      );

      expect(result).toEqual({
        ok: false,
        status: 403,
        error: "Permessi insufficienti",
      });
    });
  });
});
