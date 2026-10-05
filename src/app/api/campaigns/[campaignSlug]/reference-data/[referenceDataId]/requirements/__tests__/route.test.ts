import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { GET, POST } from "../route";
import {
  mockCampaign,
  mockDataType,
  mockReferenceData,
} from "@/test/helpers/prisma-fixtures";
import { MAX_REQUIREMENT_DEPTH } from "@/lib/repositories/dataRequirement.repository";
// `vi.mock` calls below are hoisted by Vitest above all imports, so these
// imports always resolve to the mocked modules regardless of source order.
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

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
    referenceData: {
      findUnique: vi.fn(),
    },
    dataRequirement: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const buildParams = (campaignSlug: string, referenceDataId: string) => ({
  params: Promise.resolve({ campaignSlug, referenceDataId }),
});

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
};
const campaignB = {
  ...mockCampaign({ id: 2, slug: "campaign-b" }),
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

const dataType = mockDataType({ id: 1, campaignId: 1 });
const entryA = { ...mockReferenceData({ id: 1 }), dataType };
const entryB = { ...mockReferenceData({ id: 2 }), dataType };

// `getReferenceDataByIdScoped` is called for both the path entry and (in
// POST) the requested entry: this helper mocks `findUnique` to resolve by id
// among a fixed set, scoped implicitly since the mock ignores `campaignId`
// (the actual scoping is exercised at the repository level).
function mockFindUniqueByIdAmong(entries: Array<{ id: number }>) {
  (prisma.referenceData.findUnique as Mock).mockImplementation(
    async ({ where }: { where: { id: number } }) =>
      entries.find(e => e.id === where.id) ?? null
  );
}

describe("GET /api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/requirements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements"
    );
    const response = await GET(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when the user is not head_master of the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements"
    );
    const response = await GET(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(403);
  });

  it("returns 404 when the reference data does not belong to the resolved campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/999/requirements"
    );
    const response = await GET(request, buildParams("campaign-a", "999"));

    expect(response.status).toBe(404);
  });

  it("returns 200 with the outgoing and incoming requirement graph", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    mockFindUniqueByIdAmong([entryA]);
    (prisma.dataRequirement.findMany as Mock)
      .mockResolvedValueOnce([
        { id: 1, definitionId: 1, requiredDefinitionId: 2, type: "requires" },
      ])
      .mockResolvedValueOnce([]);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements"
    );
    const response = await GET(request, buildParams("campaign-a", "1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.requires).toHaveLength(1);
    expect(json.requiredBy).toEqual([]);
  });

  it("does not allow a campaign A head_master to read requirements via campaign B's slug (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/reference-data/1/requirements"
    );
    const response = await GET(request, buildParams("campaign-b", "1"));

    expect(response.status).toBe(403);
  });
});

describe("POST /api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/requirements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements",
      {
        method: "POST",
        body: JSON.stringify({ requiredDefinitionId: 2, type: "requires" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when the caller is not head_master of the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-2", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements",
      {
        method: "POST",
        body: JSON.stringify({ requiredDefinitionId: 2, type: "requires" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(403);
  });

  it("returns 404 when the origin reference data does not belong to the resolved campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/999/requirements",
      {
        method: "POST",
        body: JSON.stringify({ requiredDefinitionId: 2, type: "requires" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a", "999"));

    expect(response.status).toBe(404);
  });

  it("returns 400 when a voice would require itself", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    mockFindUniqueByIdAmong([entryA]);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements",
      {
        method: "POST",
        body: JSON.stringify({ requiredDefinitionId: 1, type: "requires" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(400);
  });

  it("returns 404 when the required entry does not belong to the same campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    // Only entryA resolves (scoped): the required id (from another
    // campaign) is not found — invariant "same campaign only" (T-016).
    mockFindUniqueByIdAmong([entryA]);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements",
      {
        method: "POST",
        body: JSON.stringify({ requiredDefinitionId: 42, type: "requires" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(404);
    expect(prisma.dataRequirement.create).not.toHaveBeenCalled();
  });

  it("creates a requires edge between two entries of the same campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    mockFindUniqueByIdAmong([entryA, entryB]);
    (prisma.dataRequirement.findMany as Mock).mockResolvedValue([]); // no cycle
    const created = {
      id: 10,
      definitionId: 1,
      requiredDefinitionId: 2,
      type: "requires",
    };
    (prisma.dataRequirement.create as Mock).mockResolvedValue(created);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements",
      {
        method: "POST",
        body: JSON.stringify({ requiredDefinitionId: 2, type: "requires" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a", "1"));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual(created);
  });

  it("returns 409 when the requires edge would close a cycle", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    mockFindUniqueByIdAmong([entryA, entryB]);
    // B already requires A directly -> adding A requires B closes a cycle.
    (prisma.dataRequirement.findMany as Mock).mockResolvedValue([
      { requiredDefinitionId: 1 },
    ]);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements",
      {
        method: "POST",
        body: JSON.stringify({ requiredDefinitionId: 2, type: "requires" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(409);
    expect(prisma.dataRequirement.create).not.toHaveBeenCalled();
  });

  it("returns 422 (not 500) when the requires chain exceeds MAX_REQUIREMENT_DEPTH (review round 1)", async () => {
    // Reviewer round-1 finding 🟠: `RequirementDepthExceededError` ricadeva nel
    // catch generico -> 500, incoerente col 409 esplicito del ciclo rilevato
    // sullo stesso check. Catena lineare 2 -> 3 -> ... ben oltre il tetto, che
    // non richiude mai su 1.
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    mockFindUniqueByIdAmong([entryA, entryB]);
    const chainLength = MAX_REQUIREMENT_DEPTH + 20;
    (prisma.dataRequirement.findMany as Mock).mockImplementation(
      async ({ where }: { where: { definitionId: { in: number[] } } }) => {
        const id = where.definitionId.in[0];
        return id < chainLength ? [{ requiredDefinitionId: id + 1 }] : [];
      }
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements",
      {
        method: "POST",
        body: JSON.stringify({ requiredDefinitionId: 2, type: "requires" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(422);
    expect(prisma.dataRequirement.create).not.toHaveBeenCalled();
  });

  it("allows requires and blocks to coexist on the same pair (documented, non-blocking per reviewer note)", async () => {
    // Reviewer round-1 note 💡 (non-blocking, best-effort invariant per
    // Scope): nothing prevents `A requires B` and `A blocks B` at the same
    // time — the unique constraint is on (definitionId, requiredDefinitionId,
    // type), so the two types don't collide. This test documents the actual
    // behavior: both creations succeed.
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    mockFindUniqueByIdAmong([entryA, entryB]);
    (prisma.dataRequirement.findMany as Mock).mockResolvedValue([]); // no cycle
    (prisma.dataRequirement.create as Mock)
      .mockResolvedValueOnce({
        id: 10,
        definitionId: 1,
        requiredDefinitionId: 2,
        type: "requires",
      })
      .mockResolvedValueOnce({
        id: 11,
        definitionId: 1,
        requiredDefinitionId: 2,
        type: "blocks",
      });

    const requiresRequest = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements",
      {
        method: "POST",
        body: JSON.stringify({ requiredDefinitionId: 2, type: "requires" }),
      }
    );
    const requiresResponse = await POST(
      requiresRequest,
      buildParams("campaign-a", "1")
    );
    expect(requiresResponse.status).toBe(201);

    const blocksRequest = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements",
      {
        method: "POST",
        body: JSON.stringify({ requiredDefinitionId: 2, type: "blocks" }),
      }
    );
    const blocksResponse = await POST(
      blocksRequest,
      buildParams("campaign-a", "1")
    );
    expect(blocksResponse.status).toBe(201);
    expect(prisma.dataRequirement.create).toHaveBeenCalledTimes(2);
  });

  it("returns 409 when the same requirement edge already exists (unique constraint)", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    mockFindUniqueByIdAmong([entryA, entryB]);
    (prisma.dataRequirement.findMany as Mock).mockResolvedValue([]);
    (prisma.dataRequirement.create as Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
      })
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements",
      {
        method: "POST",
        body: JSON.stringify({ requiredDefinitionId: 2, type: "requires" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(409);
  });

  it("does not allow a campaign A head_master to create a requirement via campaign B's slug (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/reference-data/1/requirements",
      {
        method: "POST",
        body: JSON.stringify({ requiredDefinitionId: 2, type: "requires" }),
      }
    );
    const response = await POST(request, buildParams("campaign-b", "1"));

    expect(response.status).toBe(403);
    expect(prisma.dataRequirement.create).not.toHaveBeenCalled();
  });
});
