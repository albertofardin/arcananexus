import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { DataTypeRender, Role } from "@prisma/client";
import { DELETE } from "../route";
import {
  mockCampaign,
  mockDataType,
  mockReferenceData,
} from "@/test/helpers/prisma-fixtures";
// `vi.mock` è hoisted sopra gli import: importarli qui è sicuro, risolvono
// sempre ai moduli mockati.
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { utapi } from "@/lib/uploadthing";

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
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/uploadthing", () => ({
  utapi: {
    deleteFiles: vi.fn(),
  },
}));

const buildParams = (campaignSlug: string, referenceDataId: string) => ({
  params: Promise.resolve({ campaignSlug, referenceDataId }),
});

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
};

const documentsDataType = mockDataType({
  id: 1,
  campaignId: 1,
  renderAs: DataTypeRender.files,
});

const documentEntry = {
  ...mockReferenceData({
    id: 10,
    dataTypeId: 1,
    name: "Regolamento",
    fileUrl: "https://utfs.io/f/abc123_regolamento.pdf",
    fileKey: "abc123",
  }),
  dataType: documentsDataType,
};

function asMaster() {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: "user-1", email: "u@x" },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue({
    userId: "user-1",
    campaignId: 1,
    role: Role.master,
  });
}

function asSupporter() {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: "user-1", email: "u@x" },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue({
    userId: "user-1",
    campaignId: 1,
    role: Role.supporter,
  });
}

describe("DELETE /api/campaigns/[campaignSlug]/reference-data/[referenceDataId]/document", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
  });

  it("returns 401 when the caller is not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await DELETE(
      new NextRequest(
        "http://localhost/api/campaigns/campaign-a/reference-data/10/document"
      ),
      buildParams("campaign-a", "10")
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when the caller is only a supporter (non-master)", async () => {
    asSupporter();

    const response = await DELETE(
      new NextRequest(
        "http://localhost/api/campaigns/campaign-a/reference-data/10/document"
      ),
      buildParams("campaign-a", "10")
    );

    expect(response.status).toBe(403);
    expect(prisma.referenceData.delete).not.toHaveBeenCalled();
  });

  it("allows a campaign master (not just head_master) to delete", async () => {
    asMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(documentEntry);
    (utapi.deleteFiles as Mock).mockResolvedValue({
      success: true,
      deletedCount: 1,
    });
    (prisma.referenceData.delete as Mock).mockResolvedValue(documentEntry);

    const response = await DELETE(
      new NextRequest(
        "http://localhost/api/campaigns/campaign-a/reference-data/10/document"
      ),
      buildParams("campaign-a", "10")
    );

    expect(response.status).toBe(204);
  });

  it("returns 404 for an invalid id", async () => {
    asMaster();

    const response = await DELETE(
      new NextRequest(
        "http://localhost/api/campaigns/campaign-a/reference-data/not-a-number/document"
      ),
      buildParams("campaign-a", "not-a-number")
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when the reference data does not exist in this campaign", async () => {
    asMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(null);

    const response = await DELETE(
      new NextRequest(
        "http://localhost/api/campaigns/campaign-a/reference-data/999/document"
      ),
      buildParams("campaign-a", "999")
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the entry's DataType is not renderAs=files (wrong endpoint for catalog entries)", async () => {
    asMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue({
      ...mockReferenceData({ id: 20, dataTypeId: 2 }),
      dataType: mockDataType({
        id: 2,
        campaignId: 1,
        renderAs: DataTypeRender.catalog,
      }),
    });

    const response = await DELETE(
      new NextRequest(
        "http://localhost/api/campaigns/campaign-a/reference-data/20/document"
      ),
      buildParams("campaign-a", "20")
    );

    expect(response.status).toBe(404);
    expect(prisma.referenceData.delete).not.toHaveBeenCalled();
  });

  it("deletes the file on UploadThing before deleting the ReferenceData row", async () => {
    asMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(documentEntry);
    (utapi.deleteFiles as Mock).mockResolvedValue({
      success: true,
      deletedCount: 1,
    });
    (prisma.referenceData.delete as Mock).mockResolvedValue(documentEntry);

    await DELETE(
      new NextRequest(
        "http://localhost/api/campaigns/campaign-a/reference-data/10/document"
      ),
      buildParams("campaign-a", "10")
    );

    expect(utapi.deleteFiles).toHaveBeenCalledWith("abc123");
    expect(prisma.referenceData.delete).toHaveBeenCalledWith({
      where: { id: 10 },
    });
  });

  it("still deletes the ReferenceData row when the UploadThing cleanup fails (best-effort)", async () => {
    asMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue(documentEntry);
    (utapi.deleteFiles as Mock).mockRejectedValue(new Error("network error"));
    (prisma.referenceData.delete as Mock).mockResolvedValue(documentEntry);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await DELETE(
      new NextRequest(
        "http://localhost/api/campaigns/campaign-a/reference-data/10/document"
      ),
      buildParams("campaign-a", "10")
    );

    expect(response.status).toBe(204);
    expect(prisma.referenceData.delete).toHaveBeenCalledWith({
      where: { id: 10 },
    });
    consoleErrorSpy.mockRestore();
  });

  it("does not call UploadThing when the entry has no fileKey", async () => {
    asMaster();
    (prisma.referenceData.findUnique as Mock).mockResolvedValue({
      ...documentEntry,
      fileKey: null,
    });
    (prisma.referenceData.delete as Mock).mockResolvedValue(documentEntry);

    await DELETE(
      new NextRequest(
        "http://localhost/api/campaigns/campaign-a/reference-data/10/document"
      ),
      buildParams("campaign-a", "10")
    );

    expect(utapi.deleteFiles).not.toHaveBeenCalled();
  });
});
