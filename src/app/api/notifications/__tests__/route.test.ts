import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { GET, DELETE } from "../route";
// `vi.mock` calls below are hoisted by Vitest above all imports, so these
// imports always resolve to the mocked modules regardless of source order.
import { prisma } from "@/lib/db";
import { getEffectiveUserId } from "@/lib/authorization";

// Solo `getEffectiveUserId` (impersonation-aware) è mockato: stesso pattern
// di `me/capabilities/__tests__/route.test.ts` — la route è cross-campagna,
// scopata alla sessione (mai un `userId` accettato dal client).
vi.mock("@/lib/authorization", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/authorization")>();
  return {
    ...actual,
    getEffectiveUserId: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      // Pulizia automatica delle notifiche lette >100gg (T-0xx, vedi
      // `deleteOldReadNotifications`): chiamata sempre da
      // `listNotificationsForUser` prima della query principale, quindi va
      // mockata anche qui — `mockResolvedValue` impostato una volta sola
      // (non in `beforeEach`, `clearAllMocks` non tocca l'implementazione,
      // solo `mock.calls`/`mock.results`).
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    action: { findMany: vi.fn() },
    character: { findMany: vi.fn() },
    campaign: { findMany: vi.fn() },
  },
}));

describe("GET /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no effective user (no session)", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/notifications");
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("returns an empty list with unreadCount 0 for a user with no notifications", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (prisma.notification.findMany as Mock).mockResolvedValue([]);
    (prisma.notification.count as Mock).mockResolvedValue(0);

    const request = new NextRequest("http://localhost/api/notifications");
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ notifications: [], unreadCount: 0 });
  });

  it("never accepts a userId from the query string: always scoped to the session", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (prisma.notification.findMany as Mock).mockResolvedValue([]);
    (prisma.notification.count as Mock).mockResolvedValue(0);

    const request = new NextRequest(
      "http://localhost/api/notifications?userId=someone-else"
    );
    await GET(request);

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } })
    );
  });

  it("resolves a missive notification and reports the unread count", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (prisma.notification.findMany as Mock).mockResolvedValue([
      {
        id: 1,
        userId: "user-1",
        campaignId: 1,
        type: "missive",
        entityId: 100,
        read: false,
        createdAt: new Date("2024-01-01"),
      },
    ]);
    (prisma.notification.count as Mock).mockResolvedValue(1);
    (prisma.action.findMany as Mock).mockResolvedValue([
      {
        id: 100,
        actionData: {
          subject: "Un avviso",
          description: "Ciao",
          receiverCharacterId: 20,
        },
        character: { id: 10, name: "Aldric", avatar: null },
      },
    ]);
    (prisma.character.findMany as Mock).mockResolvedValue([
      { id: 20, name: "Berith" },
    ]);
    (prisma.campaign.findMany as Mock).mockResolvedValue([
      {
        id: 1,
        name: "La mia campagna",
        slug: "la-mia-campagna",
        logo: null,
        color: "cobalt",
      },
    ]);

    const request = new NextRequest("http://localhost/api/notifications");
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.unreadCount).toBe(1);
    expect(json.notifications).toHaveLength(1);
    expect(json.notifications[0]).toMatchObject({
      id: 1,
      type: "missive",
      subject: "Un avviso",
      senderName: "Aldric",
      receiverCharacterName: "Berith",
      campaignSlug: "la-mia-campagna",
    });
  });
});

describe("DELETE /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no effective user (no session)", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/notifications", {
      method: "DELETE",
    });
    const response = await DELETE(request);

    expect(response.status).toBe(401);
  });

  it("deletes all notifications scoped to the session user, read or not", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (prisma.notification.deleteMany as Mock).mockResolvedValue({ count: 3 });

    const request = new NextRequest("http://localhost/api/notifications", {
      method: "DELETE",
    });
    const response = await DELETE(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ count: 3 });
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });
});
