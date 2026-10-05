import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "../route";
// `vi.mock` calls below are hoisted by Vitest above all imports, so these
// imports always resolve to the mocked modules regardless of source order.
import { prisma } from "@/lib/db";
import { getEffectiveUserId } from "@/lib/authorization";

vi.mock("@/lib/authorization", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/authorization")>();
  return {
    ...actual,
    getEffectiveUserId: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    notification: { updateMany: vi.fn() },
  },
}));

const buildParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe("PATCH /api/notifications/[id]/read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no effective user (no session)", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue(null);

    const response = await PATCH(
      new NextRequest("http://localhost/api/notifications/1/read"),
      buildParams("1")
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for a non-numeric id", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");

    const response = await PATCH(
      new NextRequest("http://localhost/api/notifications/abc/read"),
      buildParams("abc")
    );

    expect(response.status).toBe(400);
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it("marks the notification as read, scoped to id + userId", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (prisma.notification.updateMany as Mock).mockResolvedValue({ count: 1 });

    const response = await PATCH(
      new NextRequest("http://localhost/api/notifications/1/read"),
      buildParams("1")
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ read: true });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 1, userId: "user-1" },
      data: { read: true },
    });
  });

  it("returns 404 without leaking whether the id exists when it belongs to another user", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (prisma.notification.updateMany as Mock).mockResolvedValue({ count: 0 });

    const response = await PATCH(
      new NextRequest("http://localhost/api/notifications/1/read"),
      buildParams("1")
    );

    expect(response.status).toBe(404);
  });
});
