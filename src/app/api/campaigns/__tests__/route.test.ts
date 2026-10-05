import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Prisma, CampaignType } from "@prisma/client";
import { GET, POST } from "../route";
import { mockCampaign, mockOrganization } from "@/test/helpers/prisma-fixtures";
// `vi.mock` calls below are hoisted by Vitest above all imports, so this
// import always resolves to the mocked module regardless of source order.
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// Mock prisma - create mock inline to avoid hoisting issues
vi.mock("@/lib/db", () => ({
  prisma: {
    campaign: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    grant: {
      findFirst: vi.fn(),
    },
    // `getUserGroupFlags` (bypass isSviluppo su GET/POST, T-049) legge questo.
    user: {
      findUnique: vi.fn(),
    },
    // `createCampaign` (T-046) crea anche il DataType "Talenti" nella stessa
    // `prisma.$transaction` della campagna.
    dataType: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

const postRequest = (body: unknown) =>
  new NextRequest("http://localhost:3000/api/campaigns", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

const SVILUPPO_SESSION = {
  user: { id: "admin-1", email: "mattia@arcana.it" },
};
const REGULAR_SESSION = { user: { id: "user-1", email: "user@example.com" } };

describe("GET /api/campaigns", () => {
  beforeEach(() => {
    (prisma.campaign.findMany as Mock).mockReset();
  });

  describe("Query Parameter Defaulting", () => {
    it("should default to the arcana-domine organization when orgSlug is missing", async () => {
      (prisma.campaign.findMany as Mock).mockResolvedValue([]);

      const request = new NextRequest("http://localhost:3000/api/campaigns");

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organization: { slug: "arcana-domine" },
            // Nessuna sessione: solo le campagne visibili (default sicuro,
            // vedi listCampaignsByOrgSlug).
            OR: [{ visibility: true }],
          },
        })
      );
    });
  });

  describe("Fetching Campaigns", () => {
    it("should fetch campaigns filtered by organization slug", async () => {
      const mockCampaigns = [
        {
          ...mockCampaign({ id: 1, name: "Campaign 1", slug: "campaign-1" }),
          dataTypes: [],
          feature: [],
        },
        {
          ...mockCampaign({ id: 2, name: "Campaign 2", slug: "campaign-2" }),
          dataTypes: [],
          feature: [],
        },
      ];

      (prisma.campaign.findMany as Mock).mockResolvedValue(mockCampaigns);

      const request = new NextRequest(
        "http://localhost:3000/api/campaigns?orgSlug=test-org"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(2);
      expect(data[0]).toMatchObject({
        id: 1,
        name: "Campaign 1",
        slug: "campaign-1",
      });
      expect(data[1]).toMatchObject({
        id: 2,
        name: "Campaign 2",
        slug: "campaign-2",
      });
    });

    it("should call Prisma with correct where clause", async () => {
      (prisma.campaign.findMany as Mock).mockResolvedValue([]);

      const request = new NextRequest(
        "http://localhost:3000/api/campaigns?orgSlug=my-org"
      );

      await GET(request);

      expect(prisma.campaign.findMany).toHaveBeenCalledWith({
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
            select: {
              name: true,
              icon: true,
              kind: true,
            },
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
        where: {
          organization: {
            slug: "my-org",
          },
          OR: [{ visibility: true }],
        },
        orderBy: {
          name: "asc",
        },
      });
    });

    it("should return empty array when no campaigns found", async () => {
      (prisma.campaign.findMany as Mock).mockResolvedValue([]);

      const request = new NextRequest(
        "http://localhost:3000/api/campaigns?orgSlug=empty-org"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([]);
    });

    it("should order campaigns by name ascending", async () => {
      const mockCampaigns = [
        {
          ...mockCampaign({ name: "Alpha Campaign" }),
          dataTypes: [],
          feature: [],
        },
        {
          ...mockCampaign({ name: "Beta Campaign" }),
          dataTypes: [],
          feature: [],
        },
        {
          ...mockCampaign({ name: "Gamma Campaign" }),
          dataTypes: [],
          feature: [],
        },
      ];

      (prisma.campaign.findMany as Mock).mockResolvedValue(mockCampaigns);

      const request = new NextRequest(
        "http://localhost:3000/api/campaigns?orgSlug=test-org"
      );

      await GET(request);

      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            name: "asc",
          },
        })
      );
    });
  });

  describe("Response Format", () => {
    it("should only return id, name, slug, and dataTypes fields", async () => {
      const mockCampaigns = [
        {
          id: 1,
          name: "Test Campaign",
          slug: "test-campaign",
          logo: null,
          cover: null,
          color: "cobalt",
          texture: "none",
          visibility: true,
          dataTypes: [],
          feature: [],
          description: "This should not be returned",
          organizationId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (prisma.campaign.findMany as Mock).mockResolvedValue(mockCampaigns);

      const request = new NextRequest(
        "http://localhost:3000/api/campaigns?orgSlug=test-org"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data[0]).toHaveProperty("id");
      expect(data[0]).toHaveProperty("name");
      expect(data[0]).toHaveProperty("slug");
      expect(data[0]).toHaveProperty("dataTypes");
      expect(data[0]).not.toHaveProperty("description");
      expect(data[0]).not.toHaveProperty("organizationId");
      expect(data[0]).not.toHaveProperty("createdAt");
      expect(data[0]).not.toHaveProperty("_count");
    });

    it("should validate response with Zod schema", async () => {
      const mockCampaigns = [
        {
          ...mockCampaign({
            id: 1,
            name: "Valid Campaign",
            slug: "valid-campaign",
          }),
          dataTypes: [],
          feature: [],
        },
      ];

      (prisma.campaign.findMany as Mock).mockResolvedValue(mockCampaigns);

      const request = new NextRequest(
        "http://localhost:3000/api/campaigns?orgSlug=test-org"
      );

      const response = await GET(request);
      const data = await response.json();

      // Should not throw if validation passes
      expect(response.status).toBe(200);
      expect(data[0]).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
        slug: expect.any(String),
        dataTypes: expect.any(Array),
      });
    });
  });

  describe("Multi-tenant Isolation", () => {
    it("should only return campaigns from the specified organization", async () => {
      const org1Campaigns = [
        {
          ...mockCampaign({ id: 1, slug: "org1-campaign" }),
          dataTypes: [],
          feature: [],
        },
      ];

      (prisma.campaign.findMany as Mock).mockResolvedValue(org1Campaigns);

      const request = new NextRequest(
        "http://localhost:3000/api/campaigns?orgSlug=org-1"
      );

      await GET(request);

      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organization: {
              slug: "org-1",
            },
            OR: [{ visibility: true }],
          },
        })
      );
    });

    it("should not return campaigns from other organizations", async () => {
      (prisma.campaign.findMany as Mock).mockResolvedValue([]);

      const request = new NextRequest(
        "http://localhost:3000/api/campaigns?orgSlug=org-2"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data).toEqual([]);
      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organization: {
              slug: "org-2",
            },
            OR: [{ visibility: true }],
          },
        })
      );
    });
  });

  describe("Visibilità campagne (T-049)", () => {
    it("includes hidden campaigns when the session belongs to a sviluppo web user", async () => {
      (prisma.campaign.findMany as Mock).mockResolvedValue([]);
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "admin-1", email: "mattia@arcana.it" },
      });
      (prisma.user.findUnique as Mock).mockResolvedValue({
        email: "mattia@arcana.it",
        isDirettivo: false,
        isSviluppo: true,
      });

      const request = new NextRequest(
        "http://localhost:3000/api/campaigns?orgSlug=test-org"
      );
      await GET(request);

      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organization: { slug: "test-org" } },
        })
      );
    });

    it("excludes hidden campaigns for an authenticated user who is not sviluppo web, unless they have a grant on them", async () => {
      (prisma.campaign.findMany as Mock).mockResolvedValue([]);
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "user@example.com" },
      });
      (prisma.user.findUnique as Mock).mockResolvedValue({
        email: "user@example.com",
        isDirettivo: false,
        isSviluppo: false,
      });

      const request = new NextRequest(
        "http://localhost:3000/api/campaigns?orgSlug=test-org"
      );
      await GET(request);

      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
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
  });
});

describe("POST /api/campaigns", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // `createCampaign` (T-046) è avvolta in `prisma.$transaction`: il mock
    // esegue davvero la callback passandole lo stesso `prisma` mockato
    // (stesso pattern della DELETE di `data-types/[dataTypeId]`).
    (prisma.$transaction as Mock).mockImplementation((async (
      fn: (tx: typeof prisma) => Promise<unknown>
    ) => fn(prisma)) as never);
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await POST(postRequest({ name: "Nuova", slug: "nuova" }));

    expect(response.status).toBe(401);
  });

  it("returns 400 on invalid body (missing slug)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(
      SVILUPPO_SESSION
    );

    const response = await POST(postRequest({ name: "Nuova" }));

    expect(response.status).toBe(400);
  });

  it("returns 400 when slug has invalid characters", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(
      SVILUPPO_SESSION
    );

    const response = await POST(
      postRequest({ name: "Nuova", slug: "Nuova Campagna!" })
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when the target organization does not exist", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(
      SVILUPPO_SESSION
    );
    (prisma.organization.findUnique as Mock).mockResolvedValue(null);

    const response = await POST(
      postRequest({ name: "Nuova", slug: "nuova", orgSlug: "inesistente" })
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 when the user has no org head_master grant", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(REGULAR_SESSION);
    (prisma.organization.findUnique as Mock).mockResolvedValue(
      mockOrganization()
    );
    (prisma.grant.findFirst as Mock).mockResolvedValue(null);

    const response = await POST(postRequest({ name: "Nuova", slug: "nuova" }));

    expect(response.status).toBe(403);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
  });

  // T-049: bypass scoped SOLO a questa route — Sviluppo Web deve poter creare
  // campagne dalla vista "god view" di Amministrazione > Ruoli anche senza
  // essere già head_master di nessuna campagna dell'organizzazione.
  it("allows a sviluppo web user to create a campaign even without an org head_master grant", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(
      SVILUPPO_SESSION
    );
    (prisma.user.findUnique as Mock).mockResolvedValue({
      email: "mattia@arcana.it",
      isDirettivo: false,
      isSviluppo: true,
    });
    (prisma.organization.findUnique as Mock).mockResolvedValue(
      mockOrganization({ id: 1 })
    );
    (prisma.grant.findFirst as Mock).mockResolvedValue(null);
    (prisma.campaign.create as Mock).mockResolvedValue(
      mockCampaign({ name: "Nuova", slug: "nuova" })
    );

    const response = await POST(postRequest({ name: "Nuova", slug: "nuova" }));

    expect(response.status).toBe(201);
    expect(prisma.campaign.create).toHaveBeenCalled();
  });

  it("returns 403 for a regular user without an org head_master grant and without sviluppo web (nessun bypass generico)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(REGULAR_SESSION);
    (prisma.user.findUnique as Mock).mockResolvedValue({
      email: "user@example.com",
      isDirettivo: false,
      isSviluppo: false,
    });
    (prisma.organization.findUnique as Mock).mockResolvedValue(
      mockOrganization({ id: 1 })
    );
    (prisma.grant.findFirst as Mock).mockResolvedValue(null);

    const response = await POST(postRequest({ name: "Nuova", slug: "nuova" }));

    expect(response.status).toBe(403);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
  });

  it("allows an organization head_master to create a campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(REGULAR_SESSION);
    (prisma.organization.findUnique as Mock).mockResolvedValue(
      mockOrganization({ id: 1 })
    );
    (prisma.grant.findFirst as Mock).mockResolvedValue({
      userId: "user-1",
      campaignId: 5,
      role: "head_master",
    });
    (prisma.campaign.create as Mock).mockResolvedValue(
      mockCampaign({ name: "Nuova", slug: "nuova" })
    );

    const response = await POST(postRequest({ name: "Nuova", slug: "nuova" }));

    expect(response.status).toBe(201);
    expect(prisma.grant.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        role: "head_master",
        campaign: { organizationId: 1 },
      },
    });
  });

  it("creates a one-shot campaign when type is oneShot", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(
      SVILUPPO_SESSION
    );
    (prisma.organization.findUnique as Mock).mockResolvedValue(
      mockOrganization({ id: 1 })
    );
    (prisma.campaign.create as Mock).mockResolvedValue(
      mockCampaign({
        name: "Evento Unico",
        slug: "evento-unico",
        type: CampaignType.oneShot,
      })
    );

    const response = await POST(
      postRequest({
        name: "Evento Unico",
        slug: "evento-unico",
        type: "oneShot",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.type).toBe("oneShot");
    expect(prisma.campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "oneShot" }),
      })
    );
  });

  it("defaults type to campaign when omitted", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(
      SVILUPPO_SESSION
    );
    (prisma.organization.findUnique as Mock).mockResolvedValue(
      mockOrganization({ id: 1 })
    );
    (prisma.campaign.create as Mock).mockResolvedValue(mockCampaign());

    await POST(postRequest({ name: "Nuova", slug: "nuova" }));

    expect(prisma.campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "campaign" }),
      })
    );
  });

  it("returns 409 when the slug already exists in the organization", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(
      SVILUPPO_SESSION
    );
    (prisma.organization.findUnique as Mock).mockResolvedValue(
      mockOrganization({ id: 1 })
    );
    (prisma.campaign.create as Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
      })
    );

    const response = await POST(
      postRequest({ name: "Nuova", slug: "duplicato" })
    );

    expect(response.status).toBe(409);
  });

  it("scopes the head_master check to the target organization (multi-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(REGULAR_SESSION);
    // L'utente è head_master solo nell'organizzazione 1, non nella 2.
    (prisma.organization.findUnique as Mock).mockResolvedValue(
      mockOrganization({ id: 2 })
    );
    (prisma.grant.findFirst as Mock).mockResolvedValue(null);

    const response = await POST(
      postRequest({ name: "Nuova", slug: "nuova", orgSlug: "org-2" })
    );

    expect(response.status).toBe(403);
    expect(prisma.grant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ campaign: { organizationId: 2 } }),
      })
    );
  });
});
