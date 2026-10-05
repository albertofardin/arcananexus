import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { PUT, DELETE } from "../route";
import { mockCampaign, mockOrganization } from "@/test/helpers/prisma-fixtures";
// `vi.mock` calls below are hoisted by Vitest above all imports, so these
// imports always resolve to the mocked modules regardless of source order.
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { utapi } from "@/lib/uploadthing";

vi.mock("@/lib/db", () => ({
  prisma: {
    campaign: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    campaignImage: {
      findMany: vi.fn(),
    },
    referenceData: {
      findMany: vi.fn(),
    },
    character: {
      findMany: vi.fn(),
    },
    action: {
      findMany: vi.fn(),
    },
    grant: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/uploadthing", () => ({
  utapi: {
    deleteFiles: vi.fn(),
  },
}));

// `after()` di Next richiede un request scope reale (AsyncLocalStorage
// popolata dalla pipeline di rendering/route handling), assente quando il
// test chiama l'handler direttamente: fuori da un vero request lancia
// `` `after` was called outside a request scope ``. Il mock lo sostituisce
// con un'esecuzione immediata e "attendibile" (il test può `await` la
// promise restituita dall'handler e poi fare le sue assertion), così il
// comportamento di background resta reale in produzione senza rompere i
// test unitari.
vi.mock("next/server", async importOriginal => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((task: () => unknown) => task()),
  };
});

// Email cablata Sviluppo Web: usata per verificare che il bypass generico è
// stato rimosso (nessun privilegio extra su questa rotta senza un Grant).
const SVILUPPO_SESSION = {
  user: { id: "admin-1", email: "mattia@arcana.it" },
};
const REGULAR_SESSION = { user: { id: "user-1", email: "user@example.com" } };
const HEAD_MASTER_GRANT = {
  userId: "user-1",
  campaignId: 1,
  role: "head_master",
};

const buildContext = (campaignSlug: string) => ({
  params: Promise.resolve({ campaignSlug }),
});

const putRequest = (body: unknown) =>
  new NextRequest("http://localhost:3000/api/campaigns/prova", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

const deleteRequest = () =>
  new NextRequest("http://localhost:3000/api/campaigns/prova", {
    method: "DELETE",
  });

const existingCampaign = {
  ...mockCampaign({ id: 1, slug: "prova" }),
  organization: mockOrganization(),
};

describe("PUT /api/campaigns/[campaignSlug]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await PUT(
      putRequest({ name: "X" }),
      buildContext("prova")
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 when the slug does not match any campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(
      SVILUPPO_SESSION
    );
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await PUT(
      putRequest({ name: "X" }),
      buildContext("inesistente")
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 when the user has no head_master grant on the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(REGULAR_SESSION);
    (prisma.campaign.findFirst as Mock).mockResolvedValue(existingCampaign);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await PUT(
      putRequest({ name: "X" }),
      buildContext("prova")
    );

    expect(response.status).toBe(403);
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  it("returns 403 for a hardcoded sviluppo email without a Grant (nessun bypass generico)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(
      SVILUPPO_SESSION
    );
    (prisma.campaign.findFirst as Mock).mockResolvedValue(existingCampaign);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await PUT(
      putRequest({ name: "Rinominata" }),
      buildContext("prova")
    );

    expect(response.status).toBe(403);
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid body", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(REGULAR_SESSION);
    (prisma.campaign.findFirst as Mock).mockResolvedValue(existingCampaign);
    (prisma.grant.findUnique as Mock).mockResolvedValue(HEAD_MASTER_GRANT);

    const response = await PUT(
      putRequest({ slug: "INVALID SLUG!" }),
      buildContext("prova")
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when the body has no updatable fields", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(REGULAR_SESSION);
    (prisma.campaign.findFirst as Mock).mockResolvedValue(existingCampaign);
    (prisma.grant.findUnique as Mock).mockResolvedValue(HEAD_MASTER_GRANT);

    const response = await PUT(putRequest({}), buildContext("prova"));

    expect(response.status).toBe(400);
  });

  it("allows the campaign's head_master to update it and to switch it to one-shot", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(REGULAR_SESSION);
    (prisma.campaign.findFirst as Mock).mockResolvedValue(existingCampaign);
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "user-1",
      campaignId: 1,
      role: "head_master",
    });
    (prisma.campaign.update as Mock).mockResolvedValue({
      ...existingCampaign,
      type: "oneShot",
    });

    const response = await PUT(
      putRequest({ type: "oneShot" }),
      buildContext("prova")
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.type).toBe("oneShot");
    expect(prisma.grant.findUnique).toHaveBeenCalledWith({
      where: { userId_campaignId: { userId: "user-1", campaignId: 1 } },
    });
  });

  it("does not allow a head_master of another campaign to update this one (multi-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(REGULAR_SESSION);
    (prisma.campaign.findFirst as Mock).mockResolvedValue(existingCampaign);
    // L'utente ha un Grant, ma non su questa campagna: findUnique con la
    // chiave composta (userId, campaignId=1) restituisce null.
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await PUT(
      putRequest({ name: "Hack" }),
      buildContext("prova")
    );

    expect(response.status).toBe(403);
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the new slug already exists in the organization", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(REGULAR_SESSION);
    (prisma.campaign.findFirst as Mock).mockResolvedValue(existingCampaign);
    (prisma.grant.findUnique as Mock).mockResolvedValue(HEAD_MASTER_GRANT);
    (prisma.campaign.update as Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
      })
    );

    const response = await PUT(
      putRequest({ slug: "duplicato" }),
      buildContext("prova")
    );

    expect(response.status).toBe(409);
  });
});

describe("DELETE /api/campaigns/[campaignSlug]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), buildContext("prova"));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the slug does not match any campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(
      SVILUPPO_SESSION
    );
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), buildContext("inesistente"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the user has no head_master grant on the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(REGULAR_SESSION);
    (prisma.campaign.findFirst as Mock).mockResolvedValue(existingCampaign);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), buildContext("prova"));

    expect(response.status).toBe(403);
    expect(prisma.campaign.delete).not.toHaveBeenCalled();
  });

  it("returns 403 for a hardcoded sviluppo email without a Grant (nessun bypass generico)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(
      SVILUPPO_SESSION
    );
    (prisma.campaign.findFirst as Mock).mockResolvedValue(existingCampaign);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), buildContext("prova"));

    expect(response.status).toBe(403);
    expect(prisma.campaign.delete).not.toHaveBeenCalled();
  });

  it("allows the campaign's head_master to delete it and cleans up its UploadThing files in the background", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(REGULAR_SESSION);
    (prisma.campaign.findFirst as Mock).mockResolvedValue(existingCampaign);
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "user-1",
      campaignId: 1,
      role: "head_master",
    });
    (prisma.campaign.findUnique as Mock).mockResolvedValue({
      logoKey: "logo-key",
      coverKey: "cover-key",
    });
    (prisma.campaignImage.findMany as Mock).mockResolvedValue([
      { key: "gallery-key-1" },
      { key: "gallery-key-2" },
    ]);
    (prisma.referenceData.findMany as Mock).mockResolvedValue([
      {
        fileKey: "document-key",
        description: '<p>Vedi <img src="https://utfs.io/f/inline-doc-key"></p>',
      },
      { fileKey: null, description: null },
    ]);
    (prisma.character.findMany as Mock).mockResolvedValue([
      { avatar: "https://utfs.io/f/avatar-key" },
      { avatar: null },
    ]);
    (prisma.action.findMany as Mock).mockResolvedValue([
      {
        actionData: {
          subject: "Oggetto",
          description: '<p><img src="https://utfs.io/f/missive-key"></p>',
          communication: true,
        },
      },
      { actionData: null },
    ]);
    (prisma.campaign.delete as Mock).mockResolvedValue(existingCampaign);
    (utapi.deleteFiles as Mock).mockResolvedValue({
      success: true,
      deletedCount: 8,
    });

    const response = await DELETE(deleteRequest(), buildContext("prova"));

    expect(response.status).toBe(204);
    expect(prisma.campaign.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(utapi.deleteFiles).toHaveBeenCalledTimes(1);
    const deletedKeys = (utapi.deleteFiles as Mock).mock.calls[0][0];
    expect(new Set(deletedKeys)).toEqual(
      new Set([
        "logo-key",
        "cover-key",
        "gallery-key-1",
        "gallery-key-2",
        "document-key",
        "avatar-key",
        "inline-doc-key",
        "missive-key",
      ])
    );
  });

  it("does not fail the DELETE when the background UploadThing cleanup errors", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(REGULAR_SESSION);
    (prisma.campaign.findFirst as Mock).mockResolvedValue(existingCampaign);
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "user-1",
      campaignId: 1,
      role: "head_master",
    });
    (prisma.campaign.findUnique as Mock).mockResolvedValue({
      logoKey: "logo-key",
      coverKey: null,
    });
    (prisma.campaignImage.findMany as Mock).mockResolvedValue([]);
    (prisma.referenceData.findMany as Mock).mockResolvedValue([]);
    (prisma.character.findMany as Mock).mockResolvedValue([]);
    (prisma.action.findMany as Mock).mockResolvedValue([]);
    (prisma.campaign.delete as Mock).mockResolvedValue(existingCampaign);
    (utapi.deleteFiles as Mock).mockRejectedValue(new Error("network error"));

    const response = await DELETE(deleteRequest(), buildContext("prova"));

    expect(response.status).toBe(204);
    expect(prisma.campaign.delete).toHaveBeenCalled();
  });

  it("does not allow a head_master of another campaign to delete this one (multi-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(REGULAR_SESSION);
    (prisma.campaign.findFirst as Mock).mockResolvedValue(existingCampaign);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), buildContext("prova"));

    expect(response.status).toBe(403);
    expect(prisma.campaign.delete).not.toHaveBeenCalled();
  });
});
