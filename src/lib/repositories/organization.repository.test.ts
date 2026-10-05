import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getOrganizationById,
  getOrganizationBySlug,
  listOrganizations,
  getUserOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
} from "./organization.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockOrganization,
  mockCampaign,
  mockGrant,
} from "@/test/helpers/prisma-fixtures";

describe("Organization Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOrganizationById", () => {
    it("should return organization when found", async () => {
      const org = mockOrganization();
      prismaMock.organization.findUnique.mockResolvedValue(org);

      const result = await getOrganizationById(prismaClient, 1);

      expect(result).toEqual(org);
      expect(prismaMock.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: undefined,
      });
    });

    it("should return null when not found", async () => {
      prismaMock.organization.findUnique.mockResolvedValue(null);

      const result = await getOrganizationById(prismaClient, 999);

      expect(result).toBeNull();
    });

    it("should include campaigns when requested", async () => {
      const org = mockOrganization();
      prismaMock.organization.findUnique.mockResolvedValue(org);

      await getOrganizationById(prismaClient, 1, true);

      expect(prismaMock.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: { campaigns: { orderBy: { name: "asc" } } },
      });
    });

    it("should not include campaigns by default", async () => {
      const org = mockOrganization();
      prismaMock.organization.findUnique.mockResolvedValue(org);

      await getOrganizationById(prismaClient, 1);

      expect(prismaMock.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: undefined,
      });
    });
  });

  describe("getOrganizationBySlug", () => {
    it("should return organization when found by slug", async () => {
      const org = mockOrganization();
      prismaMock.organization.findUnique.mockResolvedValue(org);

      const result = await getOrganizationBySlug(prismaClient, "test-org");

      expect(result).toEqual(org);
      expect(prismaMock.organization.findUnique).toHaveBeenCalledWith({
        where: { slug: "test-org" },
        include: undefined,
      });
    });

    it("should return null when slug not found", async () => {
      prismaMock.organization.findUnique.mockResolvedValue(null);

      const result = await getOrganizationBySlug(prismaClient, "nonexistent");

      expect(result).toBeNull();
    });

    it("should include campaigns when requested", async () => {
      const org = mockOrganization();
      prismaMock.organization.findUnique.mockResolvedValue(org);

      await getOrganizationBySlug(prismaClient, "test-org", true);

      expect(prismaMock.organization.findUnique).toHaveBeenCalledWith({
        where: { slug: "test-org" },
        include: { campaigns: { orderBy: { name: "asc" } } },
      });
    });
  });

  describe("listOrganizations", () => {
    it("should return paginated results with default options", async () => {
      const orgs = [
        mockOrganization(),
        mockOrganization({ id: 2, name: "Org 2" }),
      ];
      prismaMock.organization.findMany.mockResolvedValue(orgs);
      prismaMock.organization.count.mockResolvedValue(2);

      const result = await listOrganizations(prismaClient);

      expect(result.data).toEqual(orgs);
      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      });
      expect(prismaMock.organization.findMany).toHaveBeenCalledWith({
        where: undefined,
        skip: 0,
        take: 20,
        orderBy: { name: "asc" },
        include: { _count: { select: { campaigns: true } } },
      });
    });

    it("should handle pagination correctly", async () => {
      const orgs = [mockOrganization({ id: 21 })];
      prismaMock.organization.findMany.mockResolvedValue(orgs);
      prismaMock.organization.count.mockResolvedValue(25);

      const result = await listOrganizations(prismaClient, {
        page: 2,
        pageSize: 20,
      });

      expect(result.pagination).toEqual({
        page: 2,
        pageSize: 20,
        total: 25,
        totalPages: 2,
      });
      expect(prismaMock.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (2-1) * 20
          take: 20,
        })
      );
    });

    it("should filter by search query", async () => {
      prismaMock.organization.findMany.mockResolvedValue([]);
      prismaMock.organization.count.mockResolvedValue(0);

      await listOrganizations(prismaClient, { search: "test" });

      expect(prismaMock.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { name: { contains: "test", mode: "insensitive" } },
              { description: { contains: "test", mode: "insensitive" } },
            ],
          },
        })
      );
    });

    it("should handle custom ordering", async () => {
      prismaMock.organization.findMany.mockResolvedValue([]);
      prismaMock.organization.count.mockResolvedValue(0);

      await listOrganizations(prismaClient, {
        orderBy: "createdAt",
        orderDirection: "desc",
      });

      expect(prismaMock.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: "desc" },
        })
      );
    });

    it("should return empty results when no organizations found", async () => {
      prismaMock.organization.findMany.mockResolvedValue([]);
      prismaMock.organization.count.mockResolvedValue(0);

      const result = await listOrganizations(prismaClient);

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });

    it("should calculate total pages correctly", async () => {
      prismaMock.organization.findMany.mockResolvedValue([]);
      prismaMock.organization.count.mockResolvedValue(45);

      const result = await listOrganizations(prismaClient, { pageSize: 10 });

      expect(result.pagination.totalPages).toBe(5); // Math.ceil(45/10)
    });
  });

  describe("getUserOrganizations", () => {
    it("should return organizations for user with grants", async () => {
      const org1 = mockOrganization({ id: 1, name: "Org A" });
      const org2 = mockOrganization({ id: 2, name: "Org B" });
      const campaign1 = {
        ...mockCampaign({ id: 1, organizationId: 1 }),
        organization: org1,
      };
      const campaign2 = {
        ...mockCampaign({ id: 2, organizationId: 2 }),
        organization: org2,
      };

      const grants = [
        { ...mockGrant({ campaignId: 1 }), campaign: campaign1 },
        { ...mockGrant({ campaignId: 2 }), campaign: campaign2 },
      ];

      prismaMock.grant.findMany.mockResolvedValue(grants);

      const result = await getUserOrganizations(prismaClient, "user-1");

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Org A");
      expect(result[1].name).toBe("Org B");
      expect(prismaMock.grant.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        include: {
          campaign: {
            include: {
              organization: true,
            },
          },
        },
      });
    });

    it("should deduplicate organizations from multiple campaigns", async () => {
      const org = mockOrganization({ id: 1, name: "Test Org" });
      const campaign1 = {
        ...mockCampaign({ id: 1, organizationId: 1 }),
        organization: org,
      };
      const campaign2 = {
        ...mockCampaign({ id: 2, organizationId: 1 }),
        organization: org,
      };

      const grants = [
        { ...mockGrant({ campaignId: 1 }), campaign: campaign1 },
        { ...mockGrant({ campaignId: 2 }), campaign: campaign2 },
      ];

      prismaMock.grant.findMany.mockResolvedValue(grants);

      const result = await getUserOrganizations(prismaClient, "user-1");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it("should return empty array when user has no grants", async () => {
      prismaMock.grant.findMany.mockResolvedValue([]);

      const result = await getUserOrganizations(prismaClient, "user-1");

      expect(result).toEqual([]);
    });

    it("should sort organizations alphabetically by name", async () => {
      const orgZ = mockOrganization({ id: 1, name: "Z Organization" });
      const orgA = mockOrganization({ id: 2, name: "A Organization" });
      const campaignZ = {
        ...mockCampaign({ id: 1, organizationId: 1 }),
        organization: orgZ,
      };
      const campaignA = {
        ...mockCampaign({ id: 2, organizationId: 2 }),
        organization: orgA,
      };

      const grants = [
        { ...mockGrant({ campaignId: 1 }), campaign: campaignZ },
        { ...mockGrant({ campaignId: 2 }), campaign: campaignA },
      ];

      prismaMock.grant.findMany.mockResolvedValue(grants);

      const result = await getUserOrganizations(prismaClient, "user-1");

      expect(result[0].name).toBe("A Organization");
      expect(result[1].name).toBe("Z Organization");
    });
  });

  describe("createOrganization", () => {
    it("should create organization with provided data", async () => {
      const input = {
        name: "New Org",
        slug: "new-org",
        description: "A new organization",
      };
      const created = mockOrganization(input);
      prismaMock.organization.create.mockResolvedValue(created);

      const result = await createOrganization(prismaClient, input);

      expect(result).toEqual(created);
      expect(prismaMock.organization.create).toHaveBeenCalledWith({
        data: {
          name: "New Org",
          slug: "new-org",
          description: "A new organization",
        },
      });
    });

    it("should create organization without description", async () => {
      const input = {
        name: "New Org",
        slug: "new-org",
      };
      const created = mockOrganization({ ...input, description: null });
      prismaMock.organization.create.mockResolvedValue(created);

      const result = await createOrganization(prismaClient, input);

      expect(result).toEqual(created);
      expect(prismaMock.organization.create).toHaveBeenCalledWith({
        data: {
          name: "New Org",
          slug: "new-org",
          description: undefined,
        },
      });
    });
  });

  describe("updateOrganization", () => {
    it("should update organization with provided data", async () => {
      const updates = {
        name: "Updated Name",
        slug: "updated-slug",
        description: "Updated description",
      };
      const updated = mockOrganization(updates);
      prismaMock.organization.update.mockResolvedValue(updated);

      const result = await updateOrganization(prismaClient, 1, updates);

      expect(result).toEqual(updated);
      expect(prismaMock.organization.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: updates,
      });
    });

    it("should allow partial updates", async () => {
      const updates = { name: "New Name" };
      const updated = mockOrganization({ name: "New Name" });
      prismaMock.organization.update.mockResolvedValue(updated);

      const result = await updateOrganization(prismaClient, 1, updates);

      expect(result).toEqual(updated);
      expect(prismaMock.organization.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: "New Name" },
      });
    });
  });

  describe("deleteOrganization", () => {
    it("should delete organization by id", async () => {
      const org = mockOrganization();
      prismaMock.organization.delete.mockResolvedValue(org);

      const result = await deleteOrganization(prismaClient, 1);

      expect(result).toEqual(org);
      expect(prismaMock.organization.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it("should throw error when deleting non-existent organization", async () => {
      prismaMock.organization.delete.mockRejectedValue(
        new Error("Record not found")
      );

      await expect(deleteOrganization(prismaClient, 999)).rejects.toThrow(
        "Record not found"
      );
    });
  });
});
