import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Prisma, Role, DataTypeKind } from "@prisma/client";
import { GET, POST } from "../route";
import {
  mockCampaign,
  mockDataType,
  mockReferenceData,
} from "@/test/helpers/prisma-fixtures";
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

vi.mock("@/lib/db", () => {
  const prisma = {
    campaign: {
      findFirst: vi.fn(),
    },
    grant: {
      findUnique: vi.fn(),
    },
    dataType: {
      findUnique: vi.fn(),
    },
    referenceData: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    dataRequirement: {
      create: vi.fn(),
    },
    // La creazione atomica voce+requisiti (T-0xx) apre una `$transaction`:
    // il mock esegue subito il callback passandogli lo stesso `prisma`
    // mockato, così `create`/`aggregate` dentro la callback restano gli
    // stessi mock configurati dal test (nessun vero client di transazione).
    $transaction: vi.fn((callback: (tx: unknown) => unknown) =>
      callback(prisma)
    ),
  };
  return { prisma };
});

const buildParams = (campaignSlug: string) => ({
  params: Promise.resolve({ campaignSlug }),
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

describe("GET /api/campaigns/[campaignSlug]/reference-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data"
    );
    const response = await GET(request, buildParams("campaign-a"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when the user is not head_master of the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data"
    );
    const response = await GET(request, buildParams("campaign-a"));

    expect(response.status).toBe(403);
  });

  it("returns 200 with the campaign's reference data, scoped via dataType", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    const entries = [mockReferenceData({ id: 1, dataTypeId: 1 })];
    (prisma.referenceData.findMany as Mock).mockResolvedValue(entries);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data"
    );
    const response = await GET(request, buildParams("campaign-a"));
    const json = await response.json();

    expect(response.status).toBe(200);
    // `createdAt` è una `Date` nel fixture ma una stringa ISO nella risposta
    // JSON: la serializzazione round-trip normalizza il confronto.
    expect(json).toEqual(JSON.parse(JSON.stringify(entries)));
    expect(prisma.referenceData.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { dataType: { campaignId: 1 } } })
    );
  });

  it("does not allow a campaign A head_master to read campaign B's reference data (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/reference-data"
    );
    const response = await GET(request, buildParams("campaign-b"));

    expect(response.status).toBe(403);
  });
});

describe("POST /api/campaigns/[campaignSlug]/reference-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data",
      { method: "POST", body: JSON.stringify({ dataTypeId: 1, name: "Elfo" }) }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when the caller is not head_master of the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-2", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data",
      { method: "POST", body: JSON.stringify({ dataTypeId: 1, name: "Elfo" }) }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(403);
  });

  it("returns 400 on invalid input", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data",
      { method: "POST", body: JSON.stringify({ name: "Elfo" }) } // missing dataTypeId
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(400);
  });

  it("returns 404 when the dataTypeId does not belong to the resolved campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data",
      {
        method: "POST",
        body: JSON.stringify({ dataTypeId: 999, name: "Elfo" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(404);
  });

  it("returns 422 when flags are incoherent with a talent dataType's kind", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1, kind: DataTypeKind.talent })
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data",
      {
        method: "POST",
        body: JSON.stringify({
          dataTypeId: 1,
          name: "Colpo secco",
          // Missing required talent flags (cost/repeatable/creationOnly).
          flags: { unknownField: true },
        }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(422);
    expect(prisma.referenceData.create).not.toHaveBeenCalled();
  });

  it("returns 422 when flags are incoherent with a race dataType's kind", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1, kind: DataTypeKind.origins })
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data",
      {
        method: "POST",
        body: JSON.stringify({
          dataTypeId: 1,
          name: "Elfo",
          // Missing required `startingPx` for race.
          flags: {},
        }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(422);
    expect(prisma.referenceData.create).not.toHaveBeenCalled();
  });

  it("returns 422 when extra flags are sent for a kind with an empty flags schema (generic)", async () => {
    // `generic`/`religion`/`faction`/`document` have no declared flags: the
    // schema is `z.object({}).strict()`, so unknown flag keys must be
    // rejected (422), not silently ignored — QA edge case, not covered by
    // the talent/race 422 tests above.
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1, kind: DataTypeKind.generic })
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data",
      {
        method: "POST",
        body: JSON.stringify({
          dataTypeId: 1,
          name: "Oggetto",
          flags: { unexpectedField: true },
        }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(422);
    expect(prisma.referenceData.create).not.toHaveBeenCalled();
  });

  it("creates a reference data entry with no flags for a kind with an empty flags schema (generic)", async () => {
    // Symmetric happy-path: absent/empty flags on an empty-schema kind must
    // still succeed (confirms 422 above is about extra keys, not flags in
    // general).
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1, kind: DataTypeKind.generic })
    );
    (prisma.referenceData.findFirst as Mock).mockResolvedValue(null);
    (prisma.referenceData.aggregate as Mock).mockResolvedValue({
      _max: { order: null },
    });
    const created = mockReferenceData({
      id: 1,
      dataTypeId: 1,
      name: "Oggetto",
    });
    (prisma.referenceData.create as Mock).mockResolvedValue(created);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data",
      {
        method: "POST",
        body: JSON.stringify({ dataTypeId: 1, name: "Oggetto" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(201);
  });

  it("creates a reference data entry when talent flags are valid", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1, kind: DataTypeKind.talent })
    );
    (prisma.referenceData.findFirst as Mock).mockResolvedValue(null);
    (prisma.referenceData.aggregate as Mock).mockResolvedValue({
      _max: { order: null },
    });
    const created = mockReferenceData({
      id: 1,
      dataTypeId: 1,
      name: "Colpo secco",
      flags: {
        cost: 3,
        repeatable: false,
        creationOnly: false,
        isDowntimeUsable: false,
        isMissivePointBonus: false,
        isDowntimePointBonus: false,
      },
    });
    (prisma.referenceData.create as Mock).mockResolvedValue(created);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data",
      {
        method: "POST",
        body: JSON.stringify({
          dataTypeId: 1,
          name: "Colpo secco",
          flags: {
            cost: 3,
            repeatable: false,
            creationOnly: false,
            isDowntimeUsable: false,
            isMissivePointBonus: false,
            isDowntimePointBonus: false,
          },
        }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual(JSON.parse(JSON.stringify(created)));
  });

  it("creates a reference data entry when race flags are valid", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1, kind: DataTypeKind.origins })
    );
    (prisma.referenceData.findFirst as Mock).mockResolvedValue(null);
    (prisma.referenceData.aggregate as Mock).mockResolvedValue({
      _max: { order: null },
    });
    const created = mockReferenceData({
      id: 1,
      dataTypeId: 1,
      name: "Elfo",
      flags: { startingPx: 10 },
    });
    (prisma.referenceData.create as Mock).mockResolvedValue(created);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data",
      {
        method: "POST",
        body: JSON.stringify({
          dataTypeId: 1,
          name: "Elfo",
          flags: { startingPx: 10 },
        }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual(JSON.parse(JSON.stringify(created)));
  });

  // T-0xx: requisiti in bozza creati in transazione insieme alla voce, così
  // un talento con requisiti "nasce" già completo (vedi `useEntryForm`/
  // `DraftRulesEditor` lato client).
  it("creates draft requirements atomically with the reference data entry", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1, kind: DataTypeKind.talent })
    );
    (prisma.referenceData.findFirst as Mock).mockResolvedValue(null);
    (prisma.referenceData.aggregate as Mock).mockResolvedValue({
      _max: { order: null },
    });
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(
      mockReferenceData({ id: 2, dataTypeId: 1, name: "Talento base" })
    );
    const created = mockReferenceData({
      id: 10,
      dataTypeId: 1,
      name: "Talento avanzato",
    });
    (prisma.referenceData.create as Mock).mockResolvedValue(created);
    (prisma.dataRequirement.create as Mock).mockResolvedValue({});

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data",
      {
        method: "POST",
        body: JSON.stringify({
          dataTypeId: 1,
          name: "Talento avanzato",
          flags: {
            cost: 3,
            repeatable: false,
            creationOnly: false,
            isDowntimeUsable: false,
            isMissivePointBonus: false,
            isDowntimePointBonus: false,
          },
          requirements: [{ requiredDefinitionId: 2, type: "requires" }],
        }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(201);
    expect(prisma.dataRequirement.create).toHaveBeenCalledWith({
      data: {
        definitionId: 10,
        requiredDefinitionId: 2,
        type: "requires",
        groupId: null,
      },
    });
  });

  it("returns 404 without creating anything when a draft requirement targets a voice outside the campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1, kind: DataTypeKind.talent })
    );
    (prisma.referenceData.findFirst as Mock).mockResolvedValue(null);
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data",
      {
        method: "POST",
        body: JSON.stringify({
          dataTypeId: 1,
          name: "Talento avanzato",
          flags: {
            cost: 0,
            repeatable: false,
            creationOnly: false,
            isDowntimeUsable: false,
            isMissivePointBonus: false,
            isDowntimePointBonus: false,
          },
          requirements: [{ requiredDefinitionId: 999, type: "requires" }],
        }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(404);
    expect(prisma.referenceData.create).not.toHaveBeenCalled();
  });

  it("rolls back and returns 409 when a draft requirement collides on the unique constraint", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1, kind: DataTypeKind.talent })
    );
    (prisma.referenceData.findFirst as Mock).mockResolvedValue(null);
    (prisma.referenceData.aggregate as Mock).mockResolvedValue({
      _max: { order: null },
    });
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(
      mockReferenceData({ id: 2, dataTypeId: 1, name: "Talento base" })
    );
    (prisma.referenceData.create as Mock).mockResolvedValue(
      mockReferenceData({ id: 10, dataTypeId: 1, name: "Talento avanzato" })
    );
    (prisma.dataRequirement.create as Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
      })
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data",
      {
        method: "POST",
        body: JSON.stringify({
          dataTypeId: 1,
          name: "Talento avanzato",
          flags: {
            cost: 0,
            repeatable: false,
            creationOnly: false,
            isDowntimeUsable: false,
            isMissivePointBonus: false,
            isDowntimePointBonus: false,
          },
          requirements: [
            { requiredDefinitionId: 2, type: "requires" },
            { requiredDefinitionId: 2, type: "blocks" },
          ],
        }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(409);
  });

  it("returns 409 when a reference data entry with the same name already exists in the dataType", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findUnique as Mock).mockResolvedValue(
      mockDataType({ id: 1, campaignId: 1, kind: DataTypeKind.generic })
    );
    (prisma.referenceData.findFirst as Mock).mockResolvedValue(
      mockReferenceData({ id: 5, dataTypeId: 1, name: "Elfo" })
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data",
      {
        method: "POST",
        body: JSON.stringify({ dataTypeId: 1, name: "Elfo" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(409);
    expect(prisma.referenceData.create).not.toHaveBeenCalled();
  });

  it("does not allow a campaign A head_master to create reference data on campaign B (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/reference-data",
      {
        method: "POST",
        body: JSON.stringify({ dataTypeId: 1, name: "Elfo" }),
      }
    );
    const response = await POST(request, buildParams("campaign-b"));

    expect(response.status).toBe(403);
    expect(prisma.referenceData.create).not.toHaveBeenCalled();
  });
});
