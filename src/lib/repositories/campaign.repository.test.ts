import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CampaignType,
  Role,
  DataTypeKind,
  DataCardinality,
  DataTypeAssignability,
} from "@prisma/client";
import {
  getCampaignById,
  getCampaignBySlug,
  listCampaigns,
  listCampaignsByOrgSlug,
  listCampaignsWithGrants,
  getUserCampaigns,
  getCampaignWithDetails,
  createCampaign,
  updateCampaign,
  updateCampaignVisibility,
  deleteCampaign,
  updateCampaignLogo,
  updateCampaignCover,
  listCampaignImages,
  countCampaignImages,
  addCampaignImage,
  getCampaignImageById,
  removeCampaignImage,
} from "./campaign.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockCampaign,
  mockCampaignImage,
  mockOrganization,
  mockCampaignWithRelations,
  mockDataType,
} from "@/test/helpers/prisma-fixtures";

describe("Campaign Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCampaignById", () => {
    it("should return campaign when found", async () => {
      const campaign = { ...mockCampaign(), organization: mockOrganization() };
      prismaMock.campaign.findFirst.mockResolvedValue(campaign);

      const result = await getCampaignById(prismaClient, 1);

      expect(result).toEqual(campaign);
      expect(prismaMock.campaign.findFirst).toHaveBeenCalledWith({
        where: { id: 1 },
        include: { organization: true },
      });
    });

    it("should return null when not found", async () => {
      prismaMock.campaign.findFirst.mockResolvedValue(null);

      const result = await getCampaignById(prismaClient, 999);

      expect(result).toBeNull();
    });

    it("should filter by organizationId when provided", async () => {
      const campaign = { ...mockCampaign(), organization: mockOrganization() };
      prismaMock.campaign.findFirst.mockResolvedValue(campaign);

      await getCampaignById(prismaClient, 1, 1);

      expect(prismaMock.campaign.findFirst).toHaveBeenCalledWith({
        where: { id: 1, organizationId: 1 },
        include: { organization: true },
      });
    });

    it("should enforce multi-tenant isolation with organizationId", async () => {
      prismaMock.campaign.findFirst.mockResolvedValue(null);

      const result = await getCampaignById(prismaClient, 1, 999);

      expect(result).toBeNull();
      expect(prismaMock.campaign.findFirst).toHaveBeenCalledWith({
        where: { id: 1, organizationId: 999 },
        include: { organization: true },
      });
    });
  });

  describe("getCampaignBySlug", () => {
    it("should return campaign when found by slug", async () => {
      const campaign = { ...mockCampaign(), organization: mockOrganization() };
      prismaMock.campaign.findFirst.mockResolvedValue(campaign);

      const result = await getCampaignBySlug(prismaClient, "test-campaign");

      expect(result).toEqual(campaign);
      expect(prismaMock.campaign.findFirst).toHaveBeenCalledWith({
        where: { slug: "test-campaign" },
        include: { organization: true },
      });
    });

    it("should filter by organization slug when provided", async () => {
      const campaign = { ...mockCampaign(), organization: mockOrganization() };
      prismaMock.campaign.findFirst.mockResolvedValue(campaign);

      await getCampaignBySlug(prismaClient, "test-campaign", "test-org");

      expect(prismaMock.campaign.findFirst).toHaveBeenCalledWith({
        where: {
          slug: "test-campaign",
          organization: { slug: "test-org" },
        },
        include: { organization: true },
      });
    });

    it("should return null when slug not found", async () => {
      prismaMock.campaign.findFirst.mockResolvedValue(null);

      const result = await getCampaignBySlug(prismaClient, "nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("listCampaigns", () => {
    it("should return paginated results with default options", async () => {
      const campaigns = [
        { ...mockCampaign(), organization: mockOrganization() },
        { ...mockCampaign({ id: 2 }), organization: mockOrganization() },
      ];
      prismaMock.campaign.findMany.mockResolvedValue(campaigns);
      prismaMock.campaign.count.mockResolvedValue(2);

      const result = await listCampaigns(prismaClient);

      expect(result.data).toEqual(campaigns);
      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it("should filter by organizationId", async () => {
      prismaMock.campaign.findMany.mockResolvedValue([]);
      prismaMock.campaign.count.mockResolvedValue(0);

      await listCampaigns(prismaClient, { organizationId: 1 });

      expect(prismaMock.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 1 }),
        })
      );
    });

    it("should filter by search query", async () => {
      prismaMock.campaign.findMany.mockResolvedValue([]);
      prismaMock.campaign.count.mockResolvedValue(0);

      await listCampaigns(prismaClient, { search: "test" });

      expect(prismaMock.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: "test", mode: "insensitive" } },
              { description: { contains: "test", mode: "insensitive" } },
            ],
          }),
        })
      );
    });

    it("should combine organizationId and search filters", async () => {
      prismaMock.campaign.findMany.mockResolvedValue([]);
      prismaMock.campaign.count.mockResolvedValue(0);

      await listCampaigns(prismaClient, { organizationId: 1, search: "test" });

      expect(prismaMock.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 1,
            OR: [
              { name: { contains: "test", mode: "insensitive" } },
              { description: { contains: "test", mode: "insensitive" } },
            ],
          }),
        })
      );
    });

    it("should handle custom ordering", async () => {
      prismaMock.campaign.findMany.mockResolvedValue([]);
      prismaMock.campaign.count.mockResolvedValue(0);

      await listCampaigns(prismaClient, {
        orderBy: "createdAt",
        orderDirection: "desc",
      });

      expect(prismaMock.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: "desc" },
        })
      );
    });

    it("should include campaign counts", async () => {
      prismaMock.campaign.findMany.mockResolvedValue([]);
      prismaMock.campaign.count.mockResolvedValue(0);

      await listCampaigns(prismaClient);

      expect(prismaMock.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            _count: {
              select: {
                events: true,
                characters: true,
                dataTypes: true,
              },
            },
          }),
        })
      );
    });
  });

  describe("listCampaignsByOrgSlug", () => {
    it("should scope campaigns to the organization slug and only include sidebar-visible dataTypes, ordered by sidebarOrder", async () => {
      const campaigns = [
        {
          id: 1,
          name: "Test Campaign",
          slug: "test-campaign",
          logo: null,
          cover: null,
          visibility: true,
          dataTypes: [{ name: "Razze", icon: "diversity_3" }],
          feature: [{ featureType: { functionName: "downtime" } }],
        },
      ];
      prismaMock.campaign.findMany.mockResolvedValue(campaigns as never);

      const result = await listCampaignsByOrgSlug(prismaClient, "test-org");

      expect(result).toEqual(campaigns);
      expect(prismaMock.campaign.findMany).toHaveBeenCalledWith({
        where: {
          organization: { slug: "test-org" },
          OR: [{ visibility: true }],
        },
        select: {
          id: true,
          name: true,
          slug: true,
          logo: true,
          cover: true,
          color: true,
          texture: true,
          visibility: true,
          dataTypes: {
            where: { sidebarShow: true },
            select: { name: true, icon: true, kind: true },
            orderBy: [
              { sidebarOrder: { sort: "asc", nulls: "last" } },
              { name: "asc" },
            ],
          },
          feature: {
            where: { active: true },
            select: {
              featureData: true,
              featureType: { select: { functionName: true } },
            },
          },
        },
        orderBy: { name: "asc" },
      });
    });

    it("should not include campaigns from another organization", async () => {
      prismaMock.campaign.findMany.mockResolvedValue([]);

      const result = await listCampaignsByOrgSlug(prismaClient, "other-org");

      expect(result).toEqual([]);
    });

    // T-049 (visibilità campagne): di default sono escluse le campagne
    // nascoste, a meno che l'utente abbia un Grant proprio su di esse
    // (es. staff di una campagna non ancora pubblica).
    it("should exclude hidden campaigns by default, unless the user has their own grant on them", async () => {
      prismaMock.campaign.findMany.mockResolvedValue([]);

      await listCampaignsByOrgSlug(prismaClient, "test-org", {
        userId: "user-1",
      });

      expect(prismaMock.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organization: { slug: "test-org" },
            OR: [
              { visibility: true },
              { grants: { some: { userId: "user-1" } } },
            ],
          },
        })
      );
    });

    it("should include hidden campaigns when includeHidden is true (Sviluppo Web)", async () => {
      prismaMock.campaign.findMany.mockResolvedValue([]);

      await listCampaignsByOrgSlug(prismaClient, "test-org", {
        userId: "user-1",
        includeHidden: true,
      });

      expect(prismaMock.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organization: { slug: "test-org" } },
        })
      );
    });

    // T-046 round 4 (inverte il round precedente): "Talenti" segue il
    // normale `sidebarOrder` come qualunque altro `DataType`, nessuna
    // ripartizione JS residua — l'ordine è interamente delegato all'`orderBy`
    // Prisma (qui mockato già nell'ordine atteso), la funzione lo restituisce
    // senza toccarlo.
    it("should preserve the query's sidebarOrder for the talent-kind data type, without special-casing it last", async () => {
      const campaigns = [
        {
          id: 1,
          name: "Test Campaign",
          slug: "test-campaign",
          logo: null,
          cover: null,
          dataTypes: [
            { name: "Talenti", icon: "military_tech" },
            { name: "Razze", icon: "diversity_3" },
            { name: "Religioni", icon: "temple_hindu" },
          ],
        },
      ];
      prismaMock.campaign.findMany.mockResolvedValue(campaigns as never);

      const [result] = await listCampaignsByOrgSlug(prismaClient, "test-org");

      expect(result.dataTypes.map(dt => dt.name)).toEqual([
        "Talenti",
        "Razze",
        "Religioni",
      ]);
    });
  });

  describe("listCampaignsWithGrants", () => {
    it("should scope campaigns to the organization slug and include grants", async () => {
      const campaigns = [
        {
          id: 1,
          name: "Test Campaign",
          slug: "test-campaign",
          grants: [{ userId: "user-1", role: Role.head_master }],
        },
      ];
      prismaMock.campaign.findMany.mockResolvedValue(campaigns as never);

      const result = await listCampaignsWithGrants(prismaClient, "test-org");

      expect(result).toEqual(campaigns);
      expect(prismaMock.campaign.findMany).toHaveBeenCalledWith({
        where: { organization: { slug: "test-org" } },
        select: {
          id: true,
          name: true,
          slug: true,
          grants: { select: { userId: true, role: true } },
        },
        orderBy: { name: "asc" },
      });
    });

    it("should not include campaigns from another organization", async () => {
      prismaMock.campaign.findMany.mockResolvedValue([]);

      await listCampaignsWithGrants(prismaClient, "other-org");

      expect(prismaMock.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organization: { slug: "other-org" } },
        })
      );
    });
  });

  describe("getUserCampaigns", () => {
    it("should return campaigns where user has grants", async () => {
      const campaigns = [
        { ...mockCampaign({ id: 1 }), organization: mockOrganization() },
        { ...mockCampaign({ id: 2 }), organization: mockOrganization() },
      ];
      prismaMock.campaign.findMany.mockResolvedValue(campaigns);

      const result = await getUserCampaigns(prismaClient, "user-1");

      expect(result).toEqual(campaigns);
      expect(prismaMock.campaign.findMany).toHaveBeenCalledWith({
        where: {
          grants: {
            some: {
              userId: "user-1",
            },
          },
        },
        include: {
          organization: true,
          _count: {
            select: {
              events: true,
              characters: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });
    });

    it("should filter by organizationId when provided", async () => {
      prismaMock.campaign.findMany.mockResolvedValue([]);

      await getUserCampaigns(prismaClient, "user-1", 1);

      expect(prismaMock.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 1,
          }),
        })
      );
    });

    it("should return empty array when user has no grants", async () => {
      prismaMock.campaign.findMany.mockResolvedValue([]);

      const result = await getUserCampaigns(prismaClient, "user-1");

      expect(result).toEqual([]);
    });

    it("should sort campaigns alphabetically", async () => {
      const campaigns = [
        {
          ...mockCampaign({ id: 1, name: "A Campaign" }),
          organization: mockOrganization(),
        },
        {
          ...mockCampaign({ id: 2, name: "B Campaign" }),
          organization: mockOrganization(),
        },
      ];
      prismaMock.campaign.findMany.mockResolvedValue(campaigns);

      await getUserCampaigns(prismaClient, "user-1");

      expect(prismaMock.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: "asc" },
        })
      );
    });
  });

  describe("getCampaignWithDetails", () => {
    it("should return campaign with all relations", async () => {
      const campaign = mockCampaignWithRelations();
      prismaMock.campaign.findUnique.mockResolvedValue(campaign);

      const result = await getCampaignWithDetails(prismaClient, 1);

      expect(result).toEqual(campaign);
      expect(prismaMock.campaign.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          organization: true,
          dataTypes: {
            orderBy: { name: "asc" },
          },
          events: {
            orderBy: { dateEventStart: "desc" },
            take: 10,
          },
          characters: {
            orderBy: { creationDate: "desc" },
            take: 10,
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          grants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      });
    });

    it("should return null when campaign not found", async () => {
      prismaMock.campaign.findUnique.mockResolvedValue(null);

      const result = await getCampaignWithDetails(prismaClient, 999);

      expect(result).toBeNull();
    });

    it("should limit events and characters to 10", async () => {
      prismaMock.campaign.findUnique.mockResolvedValue(
        mockCampaignWithRelations()
      );

      await getCampaignWithDetails(prismaClient, 1);

      expect(prismaMock.campaign.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            events: expect.objectContaining({ take: 10 }),
            characters: expect.objectContaining({ take: 10 }),
          }),
        })
      );
    });
  });

  describe("createCampaign", () => {
    beforeEach(() => {
      // T-046: la create è avvolta in `prisma.$transaction` — il mock esegue
      // davvero la callback passandole lo stesso `prismaClient` mockato
      // (stesso pattern della DELETE di `data-types/[dataTypeId]`), così i
      // test sotto continuano a configurare/asserire `campaign.create` e
      // `dataType.create` come se la transazione fosse trasparente.
      prismaMock.$transaction.mockImplementation((async (
        fn: (tx: typeof prismaClient) => Promise<unknown>
      ) => fn(prismaClient)) as never);
    });

    it("should create campaign with provided data", async () => {
      const input = {
        name: "New Campaign",
        slug: "new-campaign",
        description: "A new campaign",
        organizationId: 1,
      };
      const created = {
        ...mockCampaign(input),
        organization: mockOrganization(),
      };
      prismaMock.campaign.create.mockResolvedValue(created);
      prismaMock.dataType.create.mockResolvedValue(mockDataType());

      const result = await createCampaign(prismaClient, input);

      expect(result).toEqual(created);
      expect(prismaMock.campaign.create).toHaveBeenCalledWith({
        data: {
          name: "New Campaign",
          slug: "new-campaign",
          description: "A new campaign",
          organizationId: 1,
          visibility: false,
        },
        include: {
          organization: true,
        },
      });
    });

    // T-049: ogni campagna nuova nasce nascosta, indipendentemente da chi la
    // crea (isSviluppo o head_master) — va resa pubblica esplicitamente.
    it("should always pass visibility: false, regardless of who creates the campaign", async () => {
      const input = {
        name: "New Campaign",
        slug: "new-campaign",
        organizationId: 1,
      };
      const created = {
        ...mockCampaign(input),
        organization: mockOrganization(),
      };
      prismaMock.campaign.create.mockResolvedValue(created);
      prismaMock.dataType.create.mockResolvedValue(mockDataType());

      await createCampaign(prismaClient, input);

      expect(prismaMock.campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ visibility: false }),
        })
      );
    });

    it("should create campaign without description", async () => {
      const input = {
        name: "New Campaign",
        slug: "new-campaign",
        organizationId: 1,
      };
      const created = {
        ...mockCampaign({ ...input, description: null }),
        organization: mockOrganization(),
      };
      prismaMock.campaign.create.mockResolvedValue(created);
      prismaMock.dataType.create.mockResolvedValue(mockDataType());

      const result = await createCampaign(prismaClient, input);

      expect(result).toEqual(created);
    });

    it("should create a one-shot campaign when type is provided", async () => {
      const input = {
        name: "One Shot",
        slug: "one-shot",
        organizationId: 1,
        type: CampaignType.oneShot,
      };
      const created = {
        ...mockCampaign(input),
        organization: mockOrganization(),
      };
      prismaMock.campaign.create.mockResolvedValue(created);
      prismaMock.dataType.create.mockResolvedValue(mockDataType());

      const result = await createCampaign(prismaClient, input);

      expect(result).toEqual(created);
      expect(prismaMock.campaign.create).toHaveBeenCalledWith({
        data: {
          name: "One Shot",
          slug: "one-shot",
          description: undefined,
          type: CampaignType.oneShot,
          organizationId: 1,
          visibility: false,
        },
        include: {
          organization: true,
        },
      });
    });

    // T-046: "Talenti" è sempre presente, esattamente una volta, in ogni
    // campagna nuova — creato nella stessa transazione della campagna, con
    // gli stessi default del backfill/self-heal.
    it("should also create the Talenti data type, in the same transaction, with the shared defaults", async () => {
      const input = {
        name: "New Campaign",
        slug: "new-campaign",
        organizationId: 1,
      };
      const created = {
        ...mockCampaign({ ...input, id: 42 }),
        organization: mockOrganization(),
      };
      prismaMock.campaign.create.mockResolvedValue(created);
      prismaMock.dataType.create.mockResolvedValue(mockDataType());

      await createCampaign(prismaClient, input);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.dataType.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Talenti",
            kind: DataTypeKind.talent,
            cardinality: DataCardinality.multi,
            assignability: DataTypeAssignability.always,
            sidebarShow: true,
            icon: "talent",
            campaignId: 42,
          }),
        })
      );
    });
  });

  describe("updateCampaign", () => {
    it("should update campaign with provided data", async () => {
      const updates = {
        name: "Updated Name",
        slug: "updated-slug",
        description: "Updated description",
      };
      const updated = {
        ...mockCampaign(updates),
        organization: mockOrganization(),
      };
      prismaMock.campaign.update.mockResolvedValue(updated);

      const result = await updateCampaign(prismaClient, 1, updates);

      expect(result).toEqual(updated);
      expect(prismaMock.campaign.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: updates,
        include: {
          organization: true,
        },
      });
    });

    it("should allow partial updates", async () => {
      const updates = { name: "New Name" };
      const updated = {
        ...mockCampaign({ name: "New Name" }),
        organization: mockOrganization(),
      };
      prismaMock.campaign.update.mockResolvedValue(updated);

      const result = await updateCampaign(prismaClient, 1, updates);

      expect(result).toEqual(updated);
    });

    it("should update the campaign type to one-shot", async () => {
      const updates = { type: CampaignType.oneShot };
      const updated = {
        ...mockCampaign(updates),
        organization: mockOrganization(),
      };
      prismaMock.campaign.update.mockResolvedValue(updated);

      const result = await updateCampaign(prismaClient, 1, updates);

      expect(result).toEqual(updated);
      expect(prismaMock.campaign.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          name: undefined,
          slug: undefined,
          description: undefined,
          type: CampaignType.oneShot,
        },
        include: {
          organization: true,
        },
      });
    });
  });

  // Toggle visibilità (T-049), isSviluppo-only lato route.
  describe("updateCampaignVisibility", () => {
    it("should update the visibility flag", async () => {
      const updated = mockCampaign({ visibility: true });
      prismaMock.campaign.update.mockResolvedValue(updated);

      const result = await updateCampaignVisibility(prismaClient, 1, true);

      expect(result).toEqual(updated);
      expect(prismaMock.campaign.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { visibility: true },
      });
    });

    it("should hide a campaign by setting visibility to false", async () => {
      const updated = mockCampaign({ visibility: false });
      prismaMock.campaign.update.mockResolvedValue(updated);

      const result = await updateCampaignVisibility(prismaClient, 1, false);

      expect(result).toEqual(updated);
      expect(prismaMock.campaign.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { visibility: false },
      });
    });
  });

  describe("deleteCampaign", () => {
    it("should delete campaign by id", async () => {
      const campaign = mockCampaign();
      prismaMock.campaign.delete.mockResolvedValue(campaign);

      const result = await deleteCampaign(prismaClient, 1);

      expect(result).toEqual(campaign);
      expect(prismaMock.campaign.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it("should throw error when deleting non-existent campaign", async () => {
      prismaMock.campaign.delete.mockRejectedValue(
        new Error("Record not found")
      );

      await expect(deleteCampaign(prismaClient, 999)).rejects.toThrow(
        "Record not found"
      );
    });
  });

  // Presentazione campagna (T-045): logo, copertina, galleria.
  describe("updateCampaignLogo", () => {
    it("should persist logo url and key", async () => {
      const updated = mockCampaign({
        logo: "https://utfs.io/f/logo-key",
        logoKey: "logo-key",
      });
      prismaMock.campaign.update.mockResolvedValue(updated);

      const result = await updateCampaignLogo(prismaClient, 1, {
        logo: "https://utfs.io/f/logo-key",
        logoKey: "logo-key",
      });

      expect(result).toEqual(updated);
      expect(prismaMock.campaign.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { logo: "https://utfs.io/f/logo-key", logoKey: "logo-key" },
      });
    });

    it("should clear logo url and key when removing", async () => {
      const updated = mockCampaign({ logo: null, logoKey: null });
      prismaMock.campaign.update.mockResolvedValue(updated);

      const result = await updateCampaignLogo(prismaClient, 1, {
        logo: null,
        logoKey: null,
      });

      expect(result).toEqual(updated);
      expect(prismaMock.campaign.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { logo: null, logoKey: null },
      });
    });
  });

  describe("updateCampaignCover", () => {
    it("should persist cover image url and key", async () => {
      const updated = mockCampaign({
        cover: "https://utfs.io/f/cover-key",
        coverKey: "cover-key",
      });
      prismaMock.campaign.update.mockResolvedValue(updated);

      const result = await updateCampaignCover(prismaClient, 1, {
        cover: "https://utfs.io/f/cover-key",
        coverKey: "cover-key",
      });

      expect(result).toEqual(updated);
      expect(prismaMock.campaign.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          cover: "https://utfs.io/f/cover-key",
          coverKey: "cover-key",
        },
      });
    });
  });

  describe("listCampaignImages", () => {
    it("should list images for a campaign ordered by ascending order", async () => {
      const images = [
        mockCampaignImage({ id: 1, order: 0 }),
        mockCampaignImage({ id: 2, order: 1 }),
      ];
      prismaMock.campaignImage.findMany.mockResolvedValue(images);

      const result = await listCampaignImages(prismaClient, 1);

      expect(result).toEqual(images);
      expect(prismaMock.campaignImage.findMany).toHaveBeenCalledWith({
        where: { campaignId: 1 },
        orderBy: { order: "asc" },
      });
    });
  });

  describe("countCampaignImages", () => {
    it("should count images scoped to the campaign", async () => {
      prismaMock.campaignImage.count.mockResolvedValue(3);

      const result = await countCampaignImages(prismaClient, 1);

      expect(result).toBe(3);
      expect(prismaMock.campaignImage.count).toHaveBeenCalledWith({
        where: { campaignId: 1 },
      });
    });
  });

  describe("addCampaignImage", () => {
    it("should create a new campaign image", async () => {
      const created = mockCampaignImage({ id: 5, order: 2 });
      prismaMock.campaignImage.create.mockResolvedValue(created);

      const result = await addCampaignImage(prismaClient, 1, {
        campaignId: 1,
        url: "https://utfs.io/f/gallery-key",
        key: "gallery-key",
        order: 2,
      });

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
  });

  describe("getCampaignImageById", () => {
    it("should scope the lookup to the campaign when provided (multi-tenant)", async () => {
      const image = mockCampaignImage({ id: 5, campaignId: 1 });
      prismaMock.campaignImage.findFirst.mockResolvedValue(image);

      const result = await getCampaignImageById(prismaClient, 5, 1);

      expect(result).toEqual(image);
      expect(prismaMock.campaignImage.findFirst).toHaveBeenCalledWith({
        where: { id: 5, campaignId: 1 },
      });
    });

    it("should return null when the image belongs to another campaign", async () => {
      prismaMock.campaignImage.findFirst.mockResolvedValue(null);

      const result = await getCampaignImageById(prismaClient, 5, 999);

      expect(result).toBeNull();
    });
  });

  describe("removeCampaignImage", () => {
    it("should delete the image by id", async () => {
      const image = mockCampaignImage({ id: 5 });
      prismaMock.campaignImage.delete.mockResolvedValue(image);

      const result = await removeCampaignImage(prismaClient, 5);

      expect(result).toEqual(image);
      expect(prismaMock.campaignImage.delete).toHaveBeenCalledWith({
        where: { id: 5 },
      });
    });
  });
});
