import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { GET, DELETE } from "../route";
import { prisma } from "@/lib/db";
import { getEffectiveUserId } from "@/lib/authorization";

vi.mock("@/lib/authorization", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/authorization")>();
  return { ...actual, getEffectiveUserId: vi.fn() };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    supportTicket: { findUnique: vi.fn(), delete: vi.fn() },
  },
}));

const buildParams = (id: string) => ({ params: Promise.resolve({ id }) });

const ticketWithMessages = (overrides?: { userId?: string }) => ({
  id: 1,
  userId: overrides?.userId ?? "user-1",
  subject: "Non riesco ad accedere",
  status: "in_attesa",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  messages: [
    {
      id: 1,
      body: "<p>Ciao</p>",
      createdAt: new Date("2024-01-01"),
      authorId: "user-1",
      author: {
        id: "user-1",
        name: "Mario Rossi",
        email: "mario@example.com",
        image: null,
        isSviluppo: false,
      },
    },
  ],
});

describe("GET /api/support/tickets/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no effective user", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/support/tickets/1"),
      buildParams("1")
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for a non-numeric id", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");

    const response = await GET(
      new NextRequest("http://localhost/api/support/tickets/abc"),
      buildParams("abc")
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 without leaking existence when the ticket belongs to someone else and the viewer is not staff", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("someone-else");
    (prisma.supportTicket.findUnique as Mock).mockResolvedValue(
      ticketWithMessages()
    );
    (prisma.user.findUnique as Mock).mockResolvedValue({
      isDirettivo: false,
      isSviluppo: false,
      email: "someone-else@example.com",
    });

    const response = await GET(
      new NextRequest("http://localhost/api/support/tickets/1"),
      buildParams("1")
    );

    expect(response.status).toBe(404);
  });

  it("returns the ticket for its owner", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (prisma.supportTicket.findUnique as Mock).mockResolvedValue(
      ticketWithMessages()
    );
    (prisma.user.findUnique as Mock).mockResolvedValue({
      isDirettivo: false,
      isSviluppo: false,
      email: "mario@example.com",
    });

    const response = await GET(
      new NextRequest("http://localhost/api/support/tickets/1"),
      buildParams("1")
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ id: 1, isOwnTicket: true, isStaff: false });
  });

  it("returns the ticket for staff even if it belongs to someone else", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("staff-1");
    (prisma.supportTicket.findUnique as Mock).mockResolvedValue(
      ticketWithMessages()
    );
    (prisma.user.findUnique as Mock).mockResolvedValue({
      isDirettivo: false,
      isSviluppo: true,
      email: "staff@example.com",
    });

    const response = await GET(
      new NextRequest("http://localhost/api/support/tickets/1"),
      buildParams("1")
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ isOwnTicket: false, isStaff: true });
  });
});

describe("DELETE /api/support/tickets/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for a non-staff user, even the ticket's own owner", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (prisma.user.findUnique as Mock).mockResolvedValue({
      isDirettivo: false,
      isSviluppo: false,
      email: "mario@example.com",
    });

    const response = await DELETE(
      new NextRequest("http://localhost/api/support/tickets/1", {
        method: "DELETE",
      }),
      buildParams("1")
    );

    expect(response.status).toBe(403);
    expect(prisma.supportTicket.delete).not.toHaveBeenCalled();
  });

  it("deletes the ticket for a staff user", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("staff-1");
    (prisma.user.findUnique as Mock).mockResolvedValue({
      isDirettivo: false,
      isSviluppo: true,
      email: "staff@example.com",
    });
    (prisma.supportTicket.findUnique as Mock).mockResolvedValue({ id: 1 });
    (prisma.supportTicket.delete as Mock).mockResolvedValue({ id: 1 });

    const response = await DELETE(
      new NextRequest("http://localhost/api/support/tickets/1", {
        method: "DELETE",
      }),
      buildParams("1")
    );

    expect(response.status).toBe(204);
    expect(prisma.supportTicket.delete).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });

  it("returns 404 for a non-existent ticket", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("staff-1");
    (prisma.user.findUnique as Mock).mockResolvedValue({
      isDirettivo: false,
      isSviluppo: true,
      email: "staff@example.com",
    });
    (prisma.supportTicket.findUnique as Mock).mockResolvedValue(null);

    const response = await DELETE(
      new NextRequest("http://localhost/api/support/tickets/999", {
        method: "DELETE",
      }),
      buildParams("999")
    );

    expect(response.status).toBe(404);
  });
});
