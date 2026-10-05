/* eslint-disable import/order -- some imports intentionally follow vi.mock() for correct hoisting */
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { mockCharacter, mockUser } from "@/test/helpers/prisma-fixtures";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => {
  const mockPrisma = {
    character: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    message: {
      deleteMany: vi.fn(),
    },
    grant: {
      findUnique: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
  };
  // Notifica di cambio-stato (T-050): l'update avviene dentro
  // `prisma.$transaction`, stesso pattern del mock in
  // `downtime/[id]/status/__tests__/route.test.ts` — il "tx" passato al
  // callback è lo stesso oggetto mockato sopra, così `prisma.character.update`/
  // `prisma.notification.create` restano gli stessi mock su cui i test
  // asseriscono.
  return {
    prisma: {
      ...mockPrisma,
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback(mockPrisma)
      ),
    },
  };
});

vi.mock("@/lib/uploadthing", () => ({
  utapi: { deleteFiles: vi.fn() },
}));

import { PUT, DELETE } from "../route";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

const buildUpdatedRow = (overrides?: Parameters<typeof mockCharacter>[0]) => ({
  ...mockCharacter(overrides),
  campaign: {
    name: "Test Campaign",
    slug: "test-campaign",
    organization: { slug: "test-org" },
  },
  user: { name: mockUser().name },
});

const putRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/characters/1", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

const contextFor = (id: string) => ({ params: Promise.resolve({ id }) });

const authAs = (userId: string) =>
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: userId, email: "u@x", name: "U" },
  });

describe("PUT /api/characters/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await PUT(putRequest({ name: "Nuovo" }), contextFor("1"));

    expect(response.status).toBe(401);
  });

  it("returns 400 for a non-numeric id", async () => {
    authAs("user-1");

    const response = await PUT(
      putRequest({ name: "Nuovo" }),
      contextFor("abc")
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for an empty payload", async () => {
    authAs("user-1");

    const response = await PUT(putRequest({}), contextFor("1"));

    expect(response.status).toBe(400);
  });

  it("returns 400 for unknown fields (strict schema)", async () => {
    authAs("user-1");

    const response = await PUT(putRequest({ campaignId: 99 }), contextFor("1"));

    expect(response.status).toBe(400);
  });

  it("returns 404 when the character does not exist", async () => {
    authAs("user-1");
    (prisma.character.findUnique as Mock).mockResolvedValue(null);

    const response = await PUT(putRequest({ name: "Nuovo" }), contextFor("1"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the user is neither owner nor campaign staff", async () => {
    authAs("intruder");
    (prisma.character.findUnique as Mock).mockResolvedValue({
      id: 1,
      userId: "user-1",
      campaignId: 1,
    });
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await PUT(putRequest({ name: "Nuovo" }), contextFor("1"));

    expect(response.status).toBe(403);
    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it("returns 403 when the owner tries to change staff-only fields", async () => {
    authAs("user-1");
    (prisma.character.findUnique as Mock).mockResolvedValue({
      id: 1,
      userId: "user-1",
      campaignId: 1,
    });
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await PUT(
      putRequest({ approvalDate: "2024-05-01T00:00:00.000Z" }),
      contextFor("1")
    );

    expect(response.status).toBe(403);
    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it("returns 403 when the owner tries to rename the character", async () => {
    authAs("user-1");
    (prisma.character.findUnique as Mock).mockResolvedValue({
      id: 1,
      userId: "user-1",
      campaignId: 1,
    });
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await PUT(
      putRequest({ name: "Nuovo Nome" }),
      contextFor("1")
    );

    expect(response.status).toBe(403);
    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it("lets the owner update the background, stamping lastUpdateDate", async () => {
    authAs("user-1");
    (prisma.character.findUnique as Mock).mockResolvedValue({
      id: 1,
      userId: "user-1",
      campaignId: 1,
    });
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);
    (prisma.character.update as Mock).mockResolvedValue(
      buildUpdatedRow({ background: "Nuovo background" })
    );

    const response = await PUT(
      putRequest({ background: "Nuovo background" }),
      contextFor("1")
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      id: 1,
      background: "Nuovo background",
      campaignSlug: "test-campaign",
      orgSlug: "test-org",
    });
    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          background: "Nuovo background",
          lastUpdateDate: expect.any(Date),
        }),
      })
    );
  });

  it("lets campaign staff update staff-only fields on another user's character", async () => {
    authAs("staff-1");
    (prisma.character.findUnique as Mock).mockResolvedValue({
      id: 1,
      userId: "user-1",
      campaignId: 1,
    });
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "staff-1",
      campaignId: 1,
      role: "head_master",
    });
    (prisma.character.update as Mock).mockResolvedValue(
      buildUpdatedRow({ masterNotes: "Aggiornate" })
    );

    const response = await PUT(
      putRequest({
        name: "Nome Corretto",
        masterNotes: "Aggiornate",
        approvalDate: "2024-05-01T00:00:00.000Z",
      }),
      contextFor("1")
    );

    expect(response.status).toBe(200);
    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          name: "Nome Corretto",
          masterNotes: "Aggiornate",
          approvalDate: new Date("2024-05-01T00:00:00.000Z"),
        }),
      })
    );
  });

  it("returns 403 when a supporter tries to update another user's character", async () => {
    authAs("supporter-1");
    (prisma.character.findUnique as Mock).mockResolvedValue({
      id: 1,
      userId: "user-1",
      campaignId: 1,
    });
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "supporter-1",
      campaignId: 1,
      role: "supporter",
    });

    const response = await PUT(
      putRequest({ masterNotes: "Non dovrebbe passare" }),
      contextFor("1")
    );

    expect(response.status).toBe(403);
    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it("lets a supporter update staff-only fields on their own character", async () => {
    authAs("supporter-1");
    (prisma.character.findUnique as Mock).mockResolvedValue({
      id: 1,
      userId: "supporter-1",
      campaignId: 1,
    });
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "supporter-1",
      campaignId: 1,
      role: "supporter",
    });
    (prisma.character.update as Mock).mockResolvedValue(
      buildUpdatedRow({ userId: "supporter-1", masterNotes: "Aggiornate" })
    );

    const response = await PUT(
      putRequest({ masterNotes: "Aggiornate" }),
      contextFor("1")
    );

    expect(response.status).toBe(200);
    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ masterNotes: "Aggiornate" }),
      })
    );
  });

  it("notifies the character owner when the derived status changes", async () => {
    authAs("staff-1");
    (prisma.character.findUnique as Mock).mockResolvedValue({
      id: 1,
      userId: "user-1",
      campaignId: 1,
      approvalDate: null,
      parkDate: null,
      deathDate: null,
    });
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "staff-1",
      campaignId: 1,
      role: "head_master",
    });
    (prisma.character.update as Mock).mockResolvedValue(
      buildUpdatedRow({
        userId: "user-1",
        approvalDate: new Date("2024-05-01T00:00:00.000Z"),
      })
    );

    const response = await PUT(
      putRequest({ approvalDate: "2024-05-01T00:00:00.000Z" }),
      contextFor("1")
    );

    expect(response.status).toBe(200);
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        campaignId: 1,
        type: "character_status",
        entityId: 1,
      },
    });
  });

  it("does not notify when the derived status is unchanged", async () => {
    authAs("staff-1");
    (prisma.character.findUnique as Mock).mockResolvedValue({
      id: 1,
      userId: "user-1",
      campaignId: 1,
      approvalDate: new Date("2024-01-01"),
      parkDate: null,
      deathDate: null,
    });
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "staff-1",
      campaignId: 1,
      role: "head_master",
    });
    (prisma.character.update as Mock).mockResolvedValue(
      buildUpdatedRow({
        userId: "user-1",
        approvalDate: new Date("2024-01-01"),
        masterNotes: "Aggiornate",
      })
    );

    const response = await PUT(
      putRequest({ masterNotes: "Aggiornate" }),
      contextFor("1")
    );

    expect(response.status).toBe(200);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("returns 500 with error envelope when prisma throws", async () => {
    authAs("user-1");
    (prisma.character.findUnique as Mock).mockRejectedValue(new Error("boom"));

    const response = await PUT(putRequest({ name: "Nuovo" }), contextFor("1"));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});

describe("DELETE /api/characters/[id]", () => {
  const deleteRequest = () =>
    new NextRequest("http://localhost/api/characters/1", { method: "DELETE" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), contextFor("1"));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the character does not exist", async () => {
    authAs("user-1");
    (prisma.character.findUnique as Mock).mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), contextFor("1"));

    expect(response.status).toBe(404);
    expect(prisma.character.delete).not.toHaveBeenCalled();
  });

  it("returns 403 for the owner without a master grant", async () => {
    authAs("user-1");
    (prisma.character.findUnique as Mock).mockResolvedValue(
      mockCharacter({ userId: "user-1" })
    );
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), contextFor("1"));

    expect(response.status).toBe(403);
    expect(prisma.character.delete).not.toHaveBeenCalled();
  });

  it("returns 403 for a supporter", async () => {
    authAs("user-2");
    (prisma.character.findUnique as Mock).mockResolvedValue(mockCharacter());
    (prisma.grant.findUnique as Mock).mockResolvedValue({ role: "supporter" });

    const response = await DELETE(deleteRequest(), contextFor("1"));

    expect(response.status).toBe(403);
  });

  it("deletes messages and the character for a master", async () => {
    authAs("user-2");
    (prisma.character.findUnique as Mock).mockResolvedValue(mockCharacter());
    (prisma.grant.findUnique as Mock).mockResolvedValue({ role: "master" });
    (prisma.character.delete as Mock).mockResolvedValue(mockCharacter());

    const response = await DELETE(deleteRequest(), contextFor("1"));

    expect(response.status).toBe(204);
    expect(prisma.message.deleteMany).toHaveBeenCalled();
    expect(prisma.character.delete).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });
});
