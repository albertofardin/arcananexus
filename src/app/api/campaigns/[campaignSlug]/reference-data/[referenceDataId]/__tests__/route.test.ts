import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role, DataTypeKind } from "@prisma/client";
import { GET, PATCH, DELETE } from "../route";
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
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    dataRequirement: {
      findMany: vi.fn(),
    },
    characterData: {
      count: vi.fn(),
    },
    // Round 2 (T-036): la DELETE avvolge count+delete in
    // `prisma.$transaction` per chiudere la finestra TOCTOU — il mock esegue
    // davvero la callback passandole lo stesso oggetto `prisma` mockato (i
    // model delegate sopra sono condivisi, non serve un vero motore
    // transazionale per questi test).
    $transaction: vi.fn(),
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

const talentEntry = {
  ...mockReferenceData({
    id: 1,
    dataTypeId: 1,
    name: "Colpo secco",
    flags: { cost: 3, repeatable: false, creationOnly: false },
  }),
  dataType: mockDataType({ id: 1, campaignId: 1, kind: DataTypeKind.talent }),
};

const raceEntry = {
  ...mockReferenceData({
    id: 2,
    dataTypeId: 2,
    name: "Elfo",
    flags: { startingPx: 10 },
  }),
  dataType: mockDataType({ id: 2, campaignId: 1, kind: DataTypeKind.origins }),
};

describe("GET /api/campaigns/[campaignSlug]/reference-data/[referenceDataId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1"
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
      "http://localhost/api/campaigns/campaign-a/reference-data/1"
    );
    const response = await GET(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(403);
  });

  it("returns 404 when the reference data does not belong to the resolved campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/999"
    );
    const response = await GET(request, buildParams("campaign-a", "999"));

    expect(response.status).toBe(404);
  });

  it("returns 200 with the reference data scoped to the resolved campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(talentEntry);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1"
    );
    const response = await GET(request, buildParams("campaign-a", "1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    // `createdAt` è una `Date` nel fixture ma una stringa ISO nella risposta
    // JSON: la serializzazione round-trip normalizza il confronto.
    expect(json).toEqual(JSON.parse(JSON.stringify(talentEntry)));
    expect(prisma.referenceData.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, dataType: { campaignId: 1 } },
      })
    );
  });

  it("does not allow a campaign A head_master to read reference data via campaign B's slug (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/reference-data/1"
    );
    const response = await GET(request, buildParams("campaign-b", "1"));

    expect(response.status).toBe(403);
  });
});

describe("PATCH /api/campaigns/[campaignSlug]/reference-data/[referenceDataId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1",
      { method: "PATCH", body: JSON.stringify({ name: "Nuovo nome" }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the reference data does not belong to the resolved campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/999",
      { method: "PATCH", body: JSON.stringify({ name: "Nuovo nome" }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "999"));

    expect(response.status).toBe(404);
  });

  it("returns 422 when updated flags are incoherent with the talent kind", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(talentEntry);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1",
      { method: "PATCH", body: JSON.stringify({ flags: { cost: -1 } }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(422);
    expect(prisma.referenceData.update).not.toHaveBeenCalled();
  });

  it("returns 422 when updated flags are incoherent with the race kind", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(raceEntry);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/2",
      {
        method: "PATCH",
        body: JSON.stringify({ flags: { startingPx: "not-a-number" } }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "2"));

    expect(response.status).toBe(422);
    expect(prisma.referenceData.update).not.toHaveBeenCalled();
  });

  it("returns 200 and updates the reference data when flags stay coherent with the kind", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(talentEntry);
    (prisma.referenceData.findFirst as Mock).mockResolvedValue(null);
    const updated = {
      ...talentEntry,
      flags: {
        cost: 5,
        repeatable: true,
        creationOnly: false,
        isDowntimeUsable: false,
        isMissivePointBonus: false,
        isDowntimePointBonus: false,
      },
    };
    (prisma.referenceData.update as Mock).mockResolvedValue(updated);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1",
      {
        method: "PATCH",
        body: JSON.stringify({
          flags: {
            cost: 5,
            repeatable: true,
            creationOnly: false,
            isDowntimeUsable: false,
            isMissivePointBonus: false,
            isDowntimePointBonus: false,
          },
        }),
      }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(JSON.parse(JSON.stringify(updated)));
  });

  it("returns 409 when renaming to a name already used in the same dataType", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(talentEntry);
    (prisma.referenceData.findFirst as Mock).mockResolvedValue(
      mockReferenceData({ id: 9, dataTypeId: 1, name: "Nome occupato" })
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1",
      { method: "PATCH", body: JSON.stringify({ name: "Nome occupato" }) }
    );
    const response = await PATCH(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(409);
    expect(prisma.referenceData.update).not.toHaveBeenCalled();
  });

  it("does not allow a campaign A head_master to patch reference data via campaign B's slug (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/reference-data/1",
      { method: "PATCH", body: JSON.stringify({ name: "X" }) }
    );
    const response = await PATCH(request, buildParams("campaign-b", "1"));

    expect(response.status).toBe(403);
    expect(prisma.referenceData.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/campaigns/[campaignSlug]/reference-data/[referenceDataId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Round 2 (T-036): esegue davvero la callback passata a
    // `prisma.$transaction`, passandole lo stesso `prisma` mockato — i test
    // sotto continuano a configurare/asserire `characterData.count` e
    // `referenceData.delete` come prima, la transazione è trasparente.
    (prisma.$transaction as Mock).mockImplementation((async (
      fn: (tx: typeof prisma) => Promise<unknown>
    ) => fn(prisma)) as never);
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the reference data does not belong to the resolved campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/999",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-a", "999"));

    expect(response.status).toBe(404);
  });

  it("returns 204 and deletes the reference data scoped to the resolved campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(talentEntry);
    (prisma.dataRequirement.findMany as Mock).mockResolvedValue([]);
    (prisma.characterData.count as Mock).mockResolvedValue(0);
    (prisma.referenceData.delete as Mock).mockResolvedValue(talentEntry);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-a", "1"));

    expect(response.status).toBe(204);
    expect(prisma.referenceData.delete).toHaveBeenCalledWith({
      where: { id: 1 },
    });
    // Guardia di regressione sul fix TOCTOU (round 2): count e delete devono
    // restare dentro la stessa `prisma.$transaction`, non due chiamate sciolte.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  // T-036: guard distinto e ortogonale al T-027 sopra — `CharacterData`
  // (assegnazioni a un PG), non `DataRequirement` (grafo tra definizioni).
  it("returns 409 and does not delete when the reference data is assigned to at least one character", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(raceEntry);
    (prisma.dataRequirement.findMany as Mock).mockResolvedValue([]);
    (prisma.characterData.count as Mock).mockResolvedValue(1);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/2",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-a", "2"));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.details.assignedCount).toBe(1);
    expect(prisma.referenceData.delete).not.toHaveBeenCalled();
  });

  it("returns 409 with the list of dependent entries when the reference data has incoming requirements", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(talentEntry);
    (prisma.dataRequirement.findMany as Mock).mockResolvedValue([
      {
        id: 5,
        definitionId: 2,
        requiredDefinitionId: 1,
        type: "requires",
        definition: { id: 2, name: "Elfo" },
      },
      {
        id: 6,
        definitionId: 3,
        requiredDefinitionId: 1,
        type: "blocks",
        definition: { id: 3, name: "Nano" },
      },
    ]);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-a", "1"));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.details.dependents).toEqual([
      { id: 2, name: "Elfo" },
      { id: 3, name: "Nano" },
    ]);
    expect(prisma.referenceData.delete).not.toHaveBeenCalled();
  });

  it("does not allow a campaign A head_master to delete reference data via campaign B's slug (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/reference-data/1",
      { method: "DELETE" }
    );
    const response = await DELETE(request, buildParams("campaign-b", "1"));

    expect(response.status).toBe(403);
    expect(prisma.referenceData.delete).not.toHaveBeenCalled();
  });
});
