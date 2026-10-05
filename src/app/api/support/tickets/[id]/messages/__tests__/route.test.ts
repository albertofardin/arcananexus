import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";
import { prisma } from "@/lib/db";
import { getEffectiveUserId } from "@/lib/authorization";

vi.mock("@/lib/authorization", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/authorization")>();
  return { ...actual, getEffectiveUserId: vi.fn() };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    supportTicket: { findUnique: vi.fn(), update: vi.fn() },
    supportMessage: { create: vi.fn() },
    notification: { create: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const buildParams = (id: string) => ({ params: Promise.resolve({ id }) });

function buildRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/support/tickets/1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ticketWithMessages = (overrides?: {
  userId?: string;
  status?: string;
}) => ({
  id: 1,
  userId: overrides?.userId ?? "user-1",
  subject: "Non riesco ad accedere",
  status: overrides?.status ?? "in_attesa",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  messages: [],
});

describe("POST /api/support/tickets/[id]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$transaction as Mock).mockImplementation(
      async (callback: (tx: unknown) => unknown) => callback(prisma)
    );
  });

  it("returns 401 when there is no effective user", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest({ body: "<p>Ciao</p>" }),
      buildParams("1")
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for an empty body", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");

    const response = await POST(buildRequest({ body: "" }), buildParams("1"));

    expect(response.status).toBe(400);
  });

  it("returns 404 without leaking existence for a ticket that belongs to someone else, non-staff viewer", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("someone-else");
    (prisma.supportTicket.findUnique as Mock).mockResolvedValue(
      ticketWithMessages()
    );
    (prisma.user.findUnique as Mock).mockResolvedValue({
      isDirettivo: false,
      isSviluppo: false,
      email: "someone-else@example.com",
    });

    const response = await POST(
      buildRequest({ body: "<p>Ciao</p>" }),
      buildParams("1")
    );

    expect(response.status).toBe(404);
  });

  it("adds the message for the ticket's owner and notifies the support staff", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (prisma.supportTicket.findUnique as Mock)
      .mockResolvedValueOnce(ticketWithMessages())
      .mockResolvedValueOnce({ userId: "user-1", status: "in_attesa" });
    (prisma.user.findUnique as Mock).mockResolvedValue({
      isDirettivo: false,
      isSviluppo: false,
      email: "mario@example.com",
    });
    (prisma.supportMessage.create as Mock).mockResolvedValue({
      id: 2,
      ticketId: 1,
      authorId: "user-1",
      body: "<p>Ciao</p>",
      createdAt: new Date(),
    });
    (prisma.supportTicket.update as Mock).mockResolvedValue({});
    (prisma.user.findMany as Mock).mockResolvedValue([{ id: "staff-1" }]);
    (prisma.notification.createMany as Mock).mockResolvedValue({ count: 1 });

    const response = await POST(
      buildRequest({ body: "<p>Ciao</p>" }),
      buildParams("1")
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.id).toBe(2);
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [{ userId: "staff-1", type: "support_reply", entityId: 1 }],
    });
  });

  it("adds the message for a staff user (isStaffAuthor=true) and notifies the ticket owner", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("staff-1");
    (prisma.supportTicket.findUnique as Mock)
      .mockResolvedValueOnce(ticketWithMessages())
      .mockResolvedValueOnce({ userId: "user-1", status: "in_attesa" });
    (prisma.user.findUnique as Mock).mockResolvedValue({
      isDirettivo: false,
      isSviluppo: true,
      email: "staff@example.com",
    });
    (prisma.supportMessage.create as Mock).mockResolvedValue({
      id: 3,
      ticketId: 1,
      authorId: "staff-1",
      body: "<p>Ti aiutiamo</p>",
      createdAt: new Date(),
    });
    (prisma.supportTicket.update as Mock).mockResolvedValue({});
    (prisma.notification.create as Mock).mockResolvedValue({});

    const response = await POST(
      buildRequest({ body: "<p>Ti aiutiamo</p>" }),
      buildParams("1")
    );

    expect(response.status).toBe(201);
    expect(prisma.supportTicket.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: "in_lavorazione" },
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { userId: "user-1", type: "support_reply", entityId: 1 },
    });
  });
});
