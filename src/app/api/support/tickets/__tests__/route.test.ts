import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import { prisma } from "@/lib/db";
import { getEffectiveUserId } from "@/lib/authorization";

// Solo `getEffectiveUserId` è mockato (impersonation-aware): `getUserGroupFlags`
// resta reale, interroga il `prisma.user.findUnique` mockato sotto — stesso
// pattern di `notifications/__tests__/route.test.ts`.
vi.mock("@/lib/authorization", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/authorization")>();
  return { ...actual, getEffectiveUserId: vi.fn() };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    supportTicket: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    supportMessage: { create: vi.fn() },
    notification: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

function buildRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/support/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("GET /api/support/tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no effective user", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/support/tickets")
    );

    expect(response.status).toBe(401);
  });

  it("returns only the user's own tickets for a non-staff user", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (prisma.user.findUnique as Mock).mockResolvedValue({
      isDirettivo: false,
      isSviluppo: false,
      email: "user@example.com",
    });
    (prisma.supportTicket.findMany as Mock).mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost/api/support/tickets")
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ tickets: [], isStaff: false });
    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } })
    );
  });

  it("returns all tickets and isStaff=true for a support staff user", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("staff-1");
    (prisma.user.findUnique as Mock).mockResolvedValue({
      isDirettivo: false,
      isSviluppo: true,
      email: "staff@example.com",
    });
    (prisma.supportTicket.findMany as Mock).mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost/api/support/tickets")
    );
    const json = await response.json();

    expect(json.isStaff).toBe(true);
    expect(
      (prisma.supportTicket.findMany as Mock).mock.calls[0][0]
    ).not.toHaveProperty("where");
  });
});

describe("POST /api/support/tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$transaction as Mock).mockImplementation(
      async (callback: (tx: unknown) => unknown) => callback(prisma)
    );
  });

  it("returns 401 when there is no effective user", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest({ subject: "Aiuto", body: "<p>Ciao</p>" })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");

    const response = await POST(buildRequest({ subject: "", body: "" }));

    expect(response.status).toBe(400);
  });

  it("creates the ticket and notifies the support staff", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (prisma.supportTicket.create as Mock).mockResolvedValue({
      id: 1,
      userId: "user-1",
      subject: "Aiuto",
      status: "in_attesa",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    (prisma.supportMessage.create as Mock).mockResolvedValue({
      id: 1,
      ticketId: 1,
      authorId: "user-1",
      body: "<p>Ciao</p>",
      createdAt: new Date(),
    });
    (prisma.user.findMany as Mock).mockResolvedValue([{ id: "staff-1" }]);
    (prisma.notification.createMany as Mock).mockResolvedValue({ count: 1 });

    const response = await POST(
      buildRequest({ subject: "Aiuto", body: "<p>Ciao</p>" })
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.id).toBe(1);
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [{ userId: "staff-1", type: "support_new", entityId: 1 }],
    });
  });
});
