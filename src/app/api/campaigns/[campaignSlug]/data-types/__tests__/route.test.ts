import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role, DataTypeKind } from "@prisma/client";
import { GET, POST } from "../route";
import { mockCampaign, mockDataType } from "@/test/helpers/prisma-fixtures";
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
    dataType: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    feature: {
      findFirst: vi.fn(),
    },
  },
}));

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

describe("GET /api/campaigns/[campaignSlug]/data-types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Feature "progress" attiva con talenti abilitati di default (T-0xx,
    // fusione talents/deathXpRecovery — talenti non ha più una propria
    // Feature): la maggior parte di questi test non riguarda il suo gate,
    // solo "Talenti access gating" sotto lo sovrascrive per esercitare il
    // caso disattivato.
    (prisma.feature.findFirst as Mock).mockResolvedValue({
      id: 1,
      active: true,
      featureData: { talentsEnabled: true },
    });
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types"
    );
    const response = await GET(request, buildParams("campaign-a"));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the campaign slug does not resolve", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/unknown/data-types"
    );
    const response = await GET(request, buildParams("unknown"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the user is not head_master of the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types"
    );
    const response = await GET(request, buildParams("campaign-a"));

    expect(response.status).toBe(403);
  });

  it("returns 200 with the campaign's data types for a head_master", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    const dataTypes = [mockDataType({ id: 1, campaignId: 1 })];
    (prisma.dataType.findMany as Mock).mockResolvedValue(dataTypes);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types"
    );
    const response = await GET(request, buildParams("campaign-a"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(dataTypes);
    expect(prisma.dataType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { campaignId: 1 } })
    );
  });

  // T-046 round 4: "Talenti" (kind: talent) è di nuovo una riga come le
  // altre in questa lista admin generica — resta non creabile/non
  // cancellabile (guard dedicati altrove), ma compare qui esattamente come
  // qualunque altro `DataType`.
  it("includes talent-kind data types in the response", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    const dataTypes = [
      mockDataType({ id: 1, campaignId: 1, name: "Razze" }),
      mockDataType({
        id: 2,
        campaignId: 1,
        name: "Talenti",
        kind: DataTypeKind.talent,
      }),
    ];
    (prisma.dataType.findMany as Mock).mockResolvedValue(dataTypes);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types"
    );
    const response = await GET(request, buildParams("campaign-a"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toHaveLength(2);
    expect(json.map((dt: { name: string }) => dt.name)).toEqual([
      "Razze",
      "Talenti",
    ]);
  });

  // La Feature "talents" governa la visibilità della categoria anche qui,
  // non solo lato giocatore: disattivarla nasconde "Talenti" pure dalla
  // gestione catalogo del master (allineato a `ManagerData.tsx`/
  // `/api/campaigns`).
  it("excludes the talent-kind data type when the talents Feature is inactive/never configured", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.feature.findFirst as Mock).mockResolvedValue(null);
    const dataTypes = [
      mockDataType({ id: 1, campaignId: 1, name: "Razze" }),
      mockDataType({
        id: 2,
        campaignId: 1,
        name: "Talenti",
        kind: DataTypeKind.talent,
      }),
    ];
    (prisma.dataType.findMany as Mock).mockResolvedValue(dataTypes);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types"
    );
    const response = await GET(request, buildParams("campaign-a"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.map((dt: { name: string }) => dt.name)).toEqual(["Razze"]);
  });

  it("does not allow a campaign A head_master to read campaign B's data types (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/data-types"
    );
    const response = await GET(request, buildParams("campaign-b"));

    expect(response.status).toBe(403);
  });
});

describe("POST /api/campaigns/[campaignSlug]/data-types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types",
      { method: "POST", body: JSON.stringify({ name: "Razze" }) }
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
      "http://localhost/api/campaigns/campaign-a/data-types",
      { method: "POST", body: JSON.stringify({ name: "Razze" }) }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(403);
  });

  it("returns 400 on invalid input", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types",
      { method: "POST", body: JSON.stringify({ name: "" }) }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(400);
  });

  it("creates a data type scoped to the resolved campaign id", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findFirst as Mock).mockResolvedValue(null);
    const created = mockDataType({
      id: 1,
      campaignId: 1,
      name: "Razze",
      kind: DataTypeKind.generic,
    });
    (prisma.dataType.create as Mock).mockResolvedValue(created);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types",
      {
        method: "POST",
        body: JSON.stringify({ name: "Razze", kind: "generic" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual(created);
    expect(prisma.dataType.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ campaignId: 1, name: "Razze" }),
      })
    );
  });

  // T-035/T-048: `assignability`/`cardinality` sono legati da un'invariante
  // applicata a livello Zod — non solo di default applicativo.
  it("returns 400 when assignability is always without a cardinality", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types",
      {
        method: "POST",
        body: JSON.stringify({ name: "Razze", assignability: "always" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(400);
    expect(prisma.dataType.create).not.toHaveBeenCalled();
  });

  it("returns 400 when assignability is none with an explicit cardinality", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Regolamenti",
          assignability: "none",
          cardinality: "multi",
        }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(400);
    expect(prisma.dataType.create).not.toHaveBeenCalled();
  });

  it("creates a non-assignable data type with cardinality: null (e.g. Regolamenti)", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findFirst as Mock).mockResolvedValue(null);
    const created = mockDataType({
      id: 1,
      campaignId: 1,
      name: "Regolamenti",
      kind: DataTypeKind.generic,
      assignability: "none",
      cardinality: null,
    });
    (prisma.dataType.create as Mock).mockResolvedValue(created);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Regolamenti",
          kind: "generic",
          assignability: "none",
          cardinality: null,
        }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(201);
    expect(prisma.dataType.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignability: "none",
          cardinality: null,
        }),
      })
    );
  });

  // T-046: "talent" non è un `kind` selezionabile per un nuovo tipo di dato
  // (nasce solo automaticamente, uno per campagna).
  it("returns 400 when kind is 'talent' (not creatable via this route)", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types",
      {
        method: "POST",
        body: JSON.stringify({ name: "Talenti", kind: "talent" }),
      }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(400);
    expect(prisma.dataType.create).not.toHaveBeenCalled();
  });

  it("returns 409 when a data type with the same name already exists in the campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.dataType.findFirst as Mock).mockResolvedValue(
      mockDataType({ id: 5, campaignId: 1, name: "Razze" })
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/data-types",
      { method: "POST", body: JSON.stringify({ name: "Razze" }) }
    );
    const response = await POST(request, buildParams("campaign-a"));

    expect(response.status).toBe(409);
    expect(prisma.dataType.create).not.toHaveBeenCalled();
  });

  it("does not allow a campaign A head_master to create data types on campaign B (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/data-types",
      { method: "POST", body: JSON.stringify({ name: "Razze" }) }
    );
    const response = await POST(request, buildParams("campaign-b"));

    expect(response.status).toBe(403);
    expect(prisma.dataType.create).not.toHaveBeenCalled();
  });
});
