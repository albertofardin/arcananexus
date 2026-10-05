import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
// `vi.mock` calls below are hoisted by Vitest above all imports, so these
// imports always resolve to the mocked modules regardless of source order.
import { PUT, DELETE } from "../route";
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
    user: {
      findUnique: vi.fn(),
    },
    campaign: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

function mockGroupFlags(
  email: string,
  overrides?: Partial<{ isDirettivo: boolean; isSviluppo: boolean }>
) {
  (prisma.user.findUnique as Mock).mockResolvedValue({
    email,
    isDirettivo: overrides?.isDirettivo ?? false,
    isSviluppo: overrides?.isSviluppo ?? false,
  });
}

const putRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/admin/campaigns/test-campaign", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

const deleteRequest = () =>
  new NextRequest("http://localhost/api/admin/campaigns/test-campaign", {
    method: "DELETE",
  });

const ctx = { params: Promise.resolve({ campaignSlug: "test-campaign" }) };

describe("PUT /api/admin/campaigns/[campaignSlug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await PUT(putRequest({ name: "Nuovo nome" }), ctx);

    expect(response.status).toBe(401);
  });

  it("returns 403 for a user without access to the Amministrazione section", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "not-admin@example.com" },
    });
    mockGroupFlags("not-admin@example.com");

    const response = await PUT(putRequest({ name: "Nuovo nome" }), ctx);

    expect(response.status).toBe(403);
  });

  it("returns 403 for a direttivo member who is not sviluppo web", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "secretary@example.com" },
    });
    mockGroupFlags("secretary@example.com", { isDirettivo: true });

    const response = await PUT(putRequest({ name: "Nuovo nome" }), ctx);

    expect(response.status).toBe(403);
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid body", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it", { isSviluppo: true });

    const response = await PUT(putRequest({ name: "" }), ctx);

    expect(response.status).toBe(400);
  });

  it("returns 404 when the campaign does not exist", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it", { isSviluppo: true });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await PUT(putRequest({ name: "Nuovo nome" }), ctx);

    expect(response.status).toBe(404);
  });

  it("returns 409 on duplicate slug", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it", { isSviluppo: true });
    (prisma.campaign.findFirst as Mock).mockResolvedValue({
      id: 5,
      slug: "test-campaign",
    });
    const { Prisma } = await import("@prisma/client");
    (prisma.campaign.update as Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "test",
      })
    );

    const response = await PUT(putRequest({ slug: "already-taken" }), ctx);

    expect(response.status).toBe(409);
  });

  it("returns 200 and updates the campaign for a sviluppo web user", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it", { isSviluppo: true });
    (prisma.campaign.findFirst as Mock).mockResolvedValue({
      id: 5,
      slug: "test-campaign",
    });
    (prisma.campaign.update as Mock).mockResolvedValue({
      id: 5,
      slug: "nuovo-slug",
      name: "Nuovo nome",
    });

    const response = await PUT(
      putRequest({ name: "Nuovo nome", slug: "nuovo-slug" }),
      ctx
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.slug).toBe("nuovo-slug");
    expect(prisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5 } })
    );
  });
});

describe("DELETE /api/admin/campaigns/[campaignSlug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), ctx);

    expect(response.status).toBe(401);
  });

  it("returns 403 for a direttivo member who is not sviluppo web", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "secretary@example.com" },
    });
    mockGroupFlags("secretary@example.com", { isDirettivo: true });

    const response = await DELETE(deleteRequest(), ctx);

    expect(response.status).toBe(403);
    expect(prisma.campaign.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when the campaign does not exist", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it", { isSviluppo: true });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), ctx);

    expect(response.status).toBe(404);
  });

  it("returns 204 and deletes the campaign for a sviluppo web user", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it", { isSviluppo: true });
    (prisma.campaign.findFirst as Mock).mockResolvedValue({
      id: 5,
      slug: "test-campaign",
    });
    (prisma.campaign.delete as Mock).mockResolvedValue({ id: 5 });

    const response = await DELETE(deleteRequest(), ctx);

    expect(response.status).toBe(204);
    expect(prisma.campaign.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });
});
