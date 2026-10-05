/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DataTypeRender, DataVisibility, Role } from "@prisma/client";
import { authorizeDocumentUpload, applyDocumentUpload } from "./documentUpload";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockCampaign,
  mockDataType,
  mockGrant,
  mockReferenceData,
} from "@/test/helpers/prisma-fixtures";

describe("authorizeDocumentUpload", () => {
  const campaign = mockCampaign({ id: 1, slug: "test-campaign" });
  const documentsDataType = mockDataType({
    id: 5,
    campaignId: 1,
    renderAs: DataTypeRender.files,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.campaign.findFirst.mockResolvedValue(campaign);
  });

  it("returns 401 when the caller is not authenticated", async () => {
    const result = await authorizeDocumentUpload(prismaClient, {
      userId: null,
      userEmail: null,
      campaignSlug: "test-campaign",
      dataTypeId: 5,
      title: "Regolamento",
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      message: "Non autenticato",
    });
  });

  it("returns 404 when the campaign slug does not resolve", async () => {
    prismaMock.campaign.findFirst.mockResolvedValue(null);

    const result = await authorizeDocumentUpload(prismaClient, {
      userId: "user-1",
      userEmail: "user@example.com",
      campaignSlug: "unknown",
      dataTypeId: 5,
      title: "Regolamento",
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      message: "Campagna non trovata",
    });
  });

  it("returns 403 when the caller is not master/head_master of the campaign", async () => {
    prismaMock.grant.findUnique.mockResolvedValue(
      mockGrant({ userId: "user-1", campaignId: 1, role: Role.supporter })
    );

    const result = await authorizeDocumentUpload(prismaClient, {
      userId: "user-1",
      userEmail: "user@example.com",
      campaignSlug: "test-campaign",
      dataTypeId: 5,
      title: "Regolamento",
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      message: "Permessi insufficienti",
    });
  });

  it("allows a campaign master", async () => {
    prismaMock.grant.findUnique.mockResolvedValue(
      mockGrant({ userId: "user-1", campaignId: 1, role: Role.master })
    );
    prismaMock.dataType.findUnique.mockResolvedValue(documentsDataType);

    const result = await authorizeDocumentUpload(prismaClient, {
      userId: "user-1",
      userEmail: "user@example.com",
      campaignSlug: "test-campaign",
      dataTypeId: 5,
      title: "Regolamento",
    });

    expect(result).toEqual({
      ok: true,
      context: {
        campaignId: 1,
        campaignSlug: "test-campaign",
        dataTypeId: 5,
        title: "Regolamento",
        referenceDataId: undefined,
        previousFileKey: null,
      },
    });
  });

  it("passes through the chosen visibility for a new document", async () => {
    prismaMock.grant.findUnique.mockResolvedValue(
      mockGrant({ userId: "user-1", campaignId: 1, role: Role.master })
    );
    prismaMock.dataType.findUnique.mockResolvedValue(documentsDataType);

    const result = await authorizeDocumentUpload(prismaClient, {
      userId: "user-1",
      userEmail: "user@example.com",
      campaignSlug: "test-campaign",
      dataTypeId: 5,
      title: "Regolamento",
      visibility: DataVisibility.hidden,
    });

    expect(result).toEqual({
      ok: true,
      context: {
        campaignId: 1,
        campaignSlug: "test-campaign",
        dataTypeId: 5,
        title: "Regolamento",
        visibility: DataVisibility.hidden,
        referenceDataId: undefined,
        previousFileKey: null,
      },
    });
  });

  it("returns 403 for a hardcoded sviluppo email without a campaign grant (nessun bypass generico)", async () => {
    prismaMock.grant.findUnique.mockResolvedValue(null);
    prismaMock.dataType.findUnique.mockResolvedValue(documentsDataType);

    const result = await authorizeDocumentUpload(prismaClient, {
      userId: "user-1",
      userEmail: "mattia@arcana.it",
      campaignSlug: "test-campaign",
      dataTypeId: 5,
      title: "Regolamento",
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      message: "Permessi insufficienti",
    });
  });

  it("returns 404 when the dataType does not belong to the campaign", async () => {
    prismaMock.grant.findUnique.mockResolvedValue(
      mockGrant({ userId: "user-1", campaignId: 1, role: Role.master })
    );
    prismaMock.dataType.findUnique.mockResolvedValue(null);

    const result = await authorizeDocumentUpload(prismaClient, {
      userId: "user-1",
      userEmail: "user@example.com",
      campaignSlug: "test-campaign",
      dataTypeId: 999,
      title: "Regolamento",
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      message: "Categoria documenti non trovata",
    });
  });

  it("returns 404 when the dataType is not renderAs=files", async () => {
    prismaMock.grant.findUnique.mockResolvedValue(
      mockGrant({ userId: "user-1", campaignId: 1, role: Role.master })
    );
    prismaMock.dataType.findUnique.mockResolvedValue(
      mockDataType({ id: 5, campaignId: 1, renderAs: DataTypeRender.catalog })
    );

    const result = await authorizeDocumentUpload(prismaClient, {
      userId: "user-1",
      userEmail: "user@example.com",
      campaignSlug: "test-campaign",
      dataTypeId: 5,
      title: "Regolamento",
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      message: "Categoria documenti non trovata",
    });
  });

  it("resolves the previous fileKey when replacing an existing document", async () => {
    prismaMock.grant.findUnique.mockResolvedValue(
      mockGrant({ userId: "user-1", campaignId: 1, role: Role.master })
    );
    prismaMock.dataType.findUnique.mockResolvedValue(documentsDataType);
    const existingDocument = {
      ...mockReferenceData({ id: 10, dataTypeId: 5, fileKey: "old-key" }),
      dataType: documentsDataType,
    };
    prismaMock.referenceData.findUnique.mockResolvedValue(existingDocument);

    const result = await authorizeDocumentUpload(prismaClient, {
      userId: "user-1",
      userEmail: "user@example.com",
      campaignSlug: "test-campaign",
      dataTypeId: 5,
      title: "Regolamento aggiornato",
      referenceDataId: 10,
    });

    expect(result).toEqual({
      ok: true,
      context: {
        campaignId: 1,
        campaignSlug: "test-campaign",
        dataTypeId: 5,
        title: "Regolamento aggiornato",
        referenceDataId: 10,
        previousFileKey: "old-key",
      },
    });
  });

  it("returns 404 when replacing a document that does not belong to this dataType/campaign (multi-tenant)", async () => {
    prismaMock.grant.findUnique.mockResolvedValue(
      mockGrant({ userId: "user-1", campaignId: 1, role: Role.master })
    );
    prismaMock.dataType.findUnique.mockResolvedValue(documentsDataType);
    prismaMock.referenceData.findUnique.mockResolvedValue(null);

    const result = await authorizeDocumentUpload(prismaClient, {
      userId: "user-1",
      userEmail: "user@example.com",
      campaignSlug: "test-campaign",
      dataTypeId: 5,
      title: "Regolamento",
      referenceDataId: 999,
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      message: "Documento non trovato",
    });
  });
});

describe("applyDocumentUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new visible ReferenceData for a first upload", async () => {
    const created = mockReferenceData({
      id: 20,
      dataTypeId: 5,
      name: "Regolamento",
      fileUrl: "https://utfs.io/f/new-key_regolamento.pdf",
      fileKey: "new-key",
    });
    prismaMock.referenceData.aggregate.mockResolvedValue({
      _max: { order: null },
    } as Awaited<ReturnType<typeof prismaMock.referenceData.aggregate>>);
    prismaMock.referenceData.create.mockResolvedValue(created);
    const deleteFile = vi.fn();

    const result = await applyDocumentUpload(
      prismaClient,
      {
        campaignId: 1,
        campaignSlug: "test-campaign",
        dataTypeId: 5,
        title: "Regolamento",
        referenceDataId: undefined,
        previousFileKey: null,
      },
      { url: "https://utfs.io/f/new-key_regolamento.pdf", key: "new-key" },
      deleteFile
    );

    expect(result).toEqual(created);
    expect(prismaMock.referenceData.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dataTypeId: 5,
          name: "Regolamento",
          visibility: DataVisibility.visible,
          fileUrl: "https://utfs.io/f/new-key_regolamento.pdf",
          fileKey: "new-key",
        }),
      })
    );
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("creates a hidden ReferenceData when the master chose that visibility", async () => {
    const created = mockReferenceData({
      id: 21,
      dataTypeId: 5,
      name: "Regolamento",
      visibility: DataVisibility.hidden,
      fileUrl: "https://utfs.io/f/new-key_regolamento.pdf",
      fileKey: "new-key",
    });
    prismaMock.referenceData.aggregate.mockResolvedValue({
      _max: { order: null },
    } as Awaited<ReturnType<typeof prismaMock.referenceData.aggregate>>);
    prismaMock.referenceData.create.mockResolvedValue(created);
    const deleteFile = vi.fn();

    const result = await applyDocumentUpload(
      prismaClient,
      {
        campaignId: 1,
        campaignSlug: "test-campaign",
        dataTypeId: 5,
        title: "Regolamento",
        visibility: DataVisibility.hidden,
        referenceDataId: undefined,
        previousFileKey: null,
      },
      { url: "https://utfs.io/f/new-key_regolamento.pdf", key: "new-key" },
      deleteFile
    );

    expect(result).toEqual(created);
    expect(prismaMock.referenceData.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          visibility: DataVisibility.hidden,
        }),
      })
    );
  });

  it("updates the existing ReferenceData and cleans up the previous file when replacing", async () => {
    const updated = mockReferenceData({
      id: 10,
      dataTypeId: 5,
      name: "Regolamento v2",
      fileUrl: "https://utfs.io/f/new-key_regolamento.pdf",
      fileKey: "new-key",
    });
    prismaMock.referenceData.update.mockResolvedValue(updated);
    const deleteFile = vi.fn().mockResolvedValue(undefined);

    const result = await applyDocumentUpload(
      prismaClient,
      {
        campaignId: 1,
        campaignSlug: "test-campaign",
        dataTypeId: 5,
        title: "Regolamento v2",
        referenceDataId: 10,
        previousFileKey: "old-key",
      },
      { url: "https://utfs.io/f/new-key_regolamento.pdf", key: "new-key" },
      deleteFile
    );

    expect(result).toEqual(updated);
    expect(prismaMock.referenceData.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({
          name: "Regolamento v2",
          fileUrl: "https://utfs.io/f/new-key_regolamento.pdf",
          fileKey: "new-key",
        }),
      })
    );
    expect(deleteFile).toHaveBeenCalledWith("old-key");
  });

  it("does not attempt cleanup when the new file has the same key as the previous one", async () => {
    prismaMock.referenceData.update.mockResolvedValue(
      mockReferenceData({ id: 10, fileKey: "same-key" })
    );
    const deleteFile = vi.fn();

    await applyDocumentUpload(
      prismaClient,
      {
        campaignId: 1,
        campaignSlug: "test-campaign",
        dataTypeId: 5,
        title: "Regolamento",
        referenceDataId: 10,
        previousFileKey: "same-key",
      },
      { url: "https://utfs.io/f/same-key_regolamento.pdf", key: "same-key" },
      deleteFile
    );

    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("does not let a failed cleanup of the previous file fail the upload", async () => {
    const updated = mockReferenceData({ id: 10, fileKey: "new-key" });
    prismaMock.referenceData.update.mockResolvedValue(updated);
    const deleteFile = vi.fn().mockRejectedValue(new Error("network error"));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await applyDocumentUpload(
      prismaClient,
      {
        campaignId: 1,
        campaignSlug: "test-campaign",
        dataTypeId: 5,
        title: "Regolamento",
        referenceDataId: 10,
        previousFileKey: "old-key",
      },
      { url: "https://utfs.io/f/new-key_regolamento.pdf", key: "new-key" },
      deleteFile
    );

    expect(result).toEqual(updated);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
