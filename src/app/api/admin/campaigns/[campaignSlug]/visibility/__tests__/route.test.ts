import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
// `vi.mock` calls below are hoisted by Vitest above all imports, so these
// imports always resolve to the mocked modules regardless of source order.
import { PATCH } from "../route";
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

const patchRequest = (body: unknown) =>
  new NextRequest(
    "http://localhost/api/admin/campaigns/test-campaign/visibility",
    {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }
  );

const ctx = { params: Promise.resolve({ campaignSlug: "test-campaign" }) };

describe("PATCH /api/admin/campaigns/[campaignSlug]/visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await PATCH(patchRequest({ visibility: true }), ctx);

    expect(response.status).toBe(401);
  });

  it("returns 403 for a user without access to the Amministrazione section", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "not-admin@example.com" },
    });
    mockGroupFlags("not-admin@example.com");

    const response = await PATCH(patchRequest({ visibility: true }), ctx);

    expect(response.status).toBe(403);
  });

  it("returns 403 for a direttivo member who is not sviluppo web", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "secretary@example.com" },
    });
    mockGroupFlags("secretary@example.com", { isDirettivo: true });

    const response = await PATCH(patchRequest({ visibility: true }), ctx);

    expect(response.status).toBe(403);
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid body", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it", { isSviluppo: true });

    const response = await PATCH(patchRequest({ visibility: "yes" }), ctx);

    expect(response.status).toBe(400);
  });

  it("returns 404 when the campaign does not exist", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it", { isSviluppo: true });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await PATCH(patchRequest({ visibility: true }), ctx);

    expect(response.status).toBe(404);
  });

  it("returns 200 and updates visibility for a sviluppo web user", async () => {
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
      slug: "test-campaign",
      visibility: true,
    });

    const response = await PATCH(patchRequest({ visibility: true }), ctx);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.visibility).toBe(true);
    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { visibility: true },
    });
  });
});
