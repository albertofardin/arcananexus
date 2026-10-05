import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { DELETE } from "../route";
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
    },
    dataRequirement: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const buildParams = (
  campaignSlug: string,
  referenceDataId: string,
  requirementId: string
) => ({
  params: Promise.resolve({ campaignSlug, referenceDataId, requirementId }),
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

describe("DELETE /api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/requirements/[requirementId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements/10",
      { method: "DELETE" }
    );
    const response = await DELETE(
      request,
      buildParams("campaign-a", "1", "10")
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when the caller is not head_master of the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-2", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements/10",
      { method: "DELETE" }
    );
    const response = await DELETE(
      request,
      buildParams("campaign-a", "1", "10")
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 when the reference data does not belong to the resolved campaign", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/999/requirements/10",
      { method: "DELETE" }
    );
    const response = await DELETE(
      request,
      buildParams("campaign-a", "999", "10")
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the requirement does not exist", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(entryA);
    (prisma.dataRequirement.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements/999",
      { method: "DELETE" }
    );
    const response = await DELETE(
      request,
      buildParams("campaign-a", "1", "999")
    );

    expect(response.status).toBe(404);
    expect(prisma.dataRequirement.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when the requirement belongs to a different origin entry (path/body mismatch)", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(entryA);
    (prisma.dataRequirement.findUnique as Mock).mockResolvedValue({
      id: 10,
      definitionId: 999, // belongs to a different entry than entryA (id 1)
      requiredDefinitionId: 2,
      type: "requires",
    });

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements/10",
      { method: "DELETE" }
    );
    const response = await DELETE(
      request,
      buildParams("campaign-a", "1", "10")
    );

    expect(response.status).toBe(404);
    expect(prisma.dataRequirement.delete).not.toHaveBeenCalled();
  });

  it("returns 204 and deletes the requirement scoped to the resolved entry", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(entryA);
    (prisma.dataRequirement.findUnique as Mock).mockResolvedValue({
      id: 10,
      definitionId: 1,
      requiredDefinitionId: 2,
      type: "requires",
    });
    (prisma.dataRequirement.delete as Mock).mockResolvedValue({
      id: 10,
      definitionId: 1,
      requiredDefinitionId: 2,
      type: "requires",
    });

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements/10",
      { method: "DELETE" }
    );
    const response = await DELETE(
      request,
      buildParams("campaign-a", "1", "10")
    );

    expect(response.status).toBe(204);
    expect(prisma.dataRequirement.delete).toHaveBeenCalledWith({
      where: { id: 10 },
    });
  });

  it("returns 404 when the underlying delete races and the row is already gone (P2025)", async () => {
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asHeadMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(entryA);
    (prisma.dataRequirement.findUnique as Mock).mockResolvedValue({
      id: 10,
      definitionId: 1,
      requiredDefinitionId: 2,
      type: "requires",
    });
    (prisma.dataRequirement.delete as Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Record not found", {
        code: "P2025",
        clientVersion: "6.19.3",
      })
    );

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/reference-data/1/requirements/10",
      { method: "DELETE" }
    );
    const response = await DELETE(
      request,
      buildParams("campaign-a", "1", "10")
    );

    expect(response.status).toBe(404);
  });

  it("does not allow a campaign A head_master to delete a requirement via campaign B's slug (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/reference-data/1/requirements/10",
      { method: "DELETE" }
    );
    const response = await DELETE(
      request,
      buildParams("campaign-b", "1", "10")
    );

    expect(response.status).toBe(403);
    expect(prisma.dataRequirement.delete).not.toHaveBeenCalled();
  });
});
