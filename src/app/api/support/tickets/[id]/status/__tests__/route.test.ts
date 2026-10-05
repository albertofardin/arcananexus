import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "../route";
import { prisma } from "@/lib/db";
import { getEffectiveUserId } from "@/lib/authorization";

vi.mock("@/lib/authorization", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/authorization")>();
  return { ...actual, getEffectiveUserId: vi.fn() };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    supportTicket: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

const buildParams = (id: string) => ({ params: Promise.resolve({ id }) });

function buildRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/support/tickets/1/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("PATCH /api/support/tickets/[id]/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no effective user", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildRequest({ status: "risolta" }),
      buildParams("1")
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid status", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("staff-1");

    const response = await PATCH(
      buildRequest({ status: "boh" }),
      buildParams("1")
    );

    expect(response.status).toBe(400);
  });

  it("returns 403 for a non-staff user, even the ticket's own owner", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (prisma.user.findUnique as Mock).mockResolvedValue({
      isDirettivo: false,
      isSviluppo: false,
      email: "mario@example.com",
    });

    const response = await PATCH(
      buildRequest({ status: "risolta" }),
      buildParams("1")
    );

    expect(response.status).toBe(403);
    expect(prisma.supportTicket.update).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-existent ticket", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("staff-1");
    (prisma.user.findUnique as Mock).mockResolvedValue({
      isDirettivo: false,
      isSviluppo: true,
      email: "staff@example.com",
    });
    (prisma.supportTicket.findUnique as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildRequest({ status: "risolta" }),
      buildParams("999")
    );

    expect(response.status).toBe(404);
  });

  it("updates the status for a staff user", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("staff-1");
    (prisma.user.findUnique as Mock).mockResolvedValue({
      isDirettivo: false,
      isSviluppo: true,
      email: "staff@example.com",
    });
    (prisma.supportTicket.findUnique as Mock).mockResolvedValue({ id: 1 });
    (prisma.supportTicket.update as Mock).mockResolvedValue({
      id: 1,
      status: "risolta",
    });

    const response = await PATCH(
      buildRequest({ status: "risolta" }),
      buildParams("1")
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("risolta");
    expect(prisma.supportTicket.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: "risolta" },
    });
  });
});
