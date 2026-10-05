import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";
// `vi.mock` calls below are hoisted by Vitest above all imports, so these
// imports always resolve to the mocked modules regardless of source order.
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import { mockCampaign, mockCharacter } from "@/test/helpers/prisma-fixtures";

vi.mock("@/lib/authorization", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/authorization")>();
  return {
    ...actual,
    requireCampaignMasterBySlug: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    character: { findMany: vi.fn() },
    xpTransaction: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

function buildRequest(body: unknown) {
  return new NextRequest(
    "http://localhost/api/campaigns/campaign-a/characters/xp-grant",
    { method: "POST", body: JSON.stringify(body) }
  );
}

const buildParams = () => ({
  params: Promise.resolve({ campaignSlug: "campaign-a" }),
});

describe("POST /api/campaigns/[campaignSlug]/characters/xp-grant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$transaction as Mock).mockImplementation(
      (fn: (tx: typeof prisma) => unknown) => fn(prisma)
    );
  });

  it("returns the authorization failure as-is when the requester is not campaign master", async () => {
    (requireCampaignMasterBySlug as Mock).mockResolvedValue({
      ok: false,
      status: 403,
      error: "Permessi insufficienti",
    });

    const response = await POST(
      buildRequest({ amount: 5, characterIds: [1] }),
      buildParams()
    );

    expect(response.status).toBe(403);
    expect(prisma.character.findMany).not.toHaveBeenCalled();
  });

  it("rejects a malformed body with 400", async () => {
    (requireCampaignMasterBySlug as Mock).mockResolvedValue({
      ok: true,
      campaign: mockCampaign({ id: 1 }),
      userId: "master-1",
      role: "master",
    });

    const response = await POST(
      buildRequest({ amount: "not-a-number", characterIds: [1] }),
      buildParams()
    );

    expect(response.status).toBe(400);
  });

  it("rejects a zero amount with 400", async () => {
    (requireCampaignMasterBySlug as Mock).mockResolvedValue({
      ok: true,
      campaign: mockCampaign({ id: 1 }),
      userId: "master-1",
      role: "master",
    });

    const response = await POST(
      buildRequest({ amount: 0, characterIds: [1] }),
      buildParams()
    );

    expect(response.status).toBe(400);
  });

  it("rejects an empty characterIds list with 400", async () => {
    (requireCampaignMasterBySlug as Mock).mockResolvedValue({
      ok: true,
      campaign: mockCampaign({ id: 1 }),
      userId: "master-1",
      role: "master",
    });

    const response = await POST(
      buildRequest({ amount: 5, characterIds: [] }),
      buildParams()
    );

    expect(response.status).toBe(400);
  });

  it("grants the amount to every selected character", async () => {
    (requireCampaignMasterBySlug as Mock).mockResolvedValue({
      ok: true,
      campaign: mockCampaign({ id: 1 }),
      userId: "master-1",
      role: "master",
    });
    (prisma.character.findMany as Mock).mockResolvedValue([
      mockCharacter({ id: 1 }),
      mockCharacter({ id: 2 }),
      mockCharacter({ id: 3 }),
    ]);
    (prisma.xpTransaction.create as Mock).mockResolvedValue({});

    const response = await POST(
      buildRequest({
        amount: -2,
        characterIds: [1, 2],
      }),
      buildParams()
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ updatedCount: 2 });

    expect(prisma.xpTransaction.create).toHaveBeenCalledTimes(2);
    expect(prisma.xpTransaction.create).toHaveBeenCalledWith({
      data: {
        characterId: 1,
        amount: -2,
        reason: "update",
        note: null,
        updatedById: "master-1",
      },
    });
    expect(prisma.xpTransaction.create).toHaveBeenCalledWith({
      data: {
        characterId: 2,
        amount: -2,
        reason: "update",
        note: null,
        updatedById: "master-1",
      },
    });
  });

  it("allows granting XP to a selected PNG, but excludes non-active characters", async () => {
    (requireCampaignMasterBySlug as Mock).mockResolvedValue({
      ok: true,
      campaign: mockCampaign({ id: 1 }),
      userId: "master-1",
      role: "master",
    });
    (prisma.character.findMany as Mock).mockResolvedValue([
      mockCharacter({ id: 1 }), // PG attivo (default fixture)
      mockCharacter({ id: 2, type: "png" }), // PNG attivo: incluso
      mockCharacter({ id: 3, approvalDate: null }), // PG "in revisione": escluso
      mockCharacter({ id: 4, deathDate: new Date("2024-06-01") }), // PG deceduto: escluso
      mockCharacter({ id: 5, parkDate: new Date("2024-06-01") }), // PG parcheggiato: escluso
    ]);
    (prisma.xpTransaction.create as Mock).mockResolvedValue({});

    const response = await POST(
      buildRequest({
        amount: 5,
        // id 3-5 selezionati ma non attivi: ignorati, nessuna transazione.
        characterIds: [1, 2, 3, 4, 5],
      }),
      buildParams()
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ updatedCount: 2 });
    expect(prisma.xpTransaction.create).toHaveBeenCalledTimes(2);
    expect(prisma.xpTransaction.create).toHaveBeenCalledWith({
      data: {
        characterId: 1,
        amount: 5,
        reason: "update",
        note: null,
        updatedById: "master-1",
      },
    });
    expect(prisma.xpTransaction.create).toHaveBeenCalledWith({
      data: {
        characterId: 2,
        amount: 5,
        reason: "update",
        note: null,
        updatedById: "master-1",
      },
    });
  });

  it("propagates the optional note to every created transaction", async () => {
    (requireCampaignMasterBySlug as Mock).mockResolvedValue({
      ok: true,
      campaign: mockCampaign({ id: 1 }),
      userId: "master-1",
      role: "master",
    });
    (prisma.character.findMany as Mock).mockResolvedValue([
      mockCharacter({ id: 1 }),
    ]);
    (prisma.xpTransaction.create as Mock).mockResolvedValue({});

    const response = await POST(
      buildRequest({
        amount: 5,
        characterIds: [1],
        note: "Bonus di fine evento",
      }),
      buildParams()
    );

    expect(response.status).toBe(200);
    expect(prisma.xpTransaction.create).toHaveBeenCalledWith({
      data: {
        characterId: 1,
        amount: 5,
        reason: "update",
        note: "Bonus di fine evento",
        updatedById: "master-1",
      },
    });
  });

  it("ignores a characterId that does not belong to the campaign", async () => {
    (requireCampaignMasterBySlug as Mock).mockResolvedValue({
      ok: true,
      campaign: mockCampaign({ id: 1 }),
      userId: "master-1",
      role: "master",
    });
    (prisma.character.findMany as Mock).mockResolvedValue([
      mockCharacter({ id: 1 }),
    ]);

    const response = await POST(
      buildRequest({ amount: 5, characterIds: [999] }),
      buildParams()
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ updatedCount: 0 });
    expect(prisma.xpTransaction.create).not.toHaveBeenCalled();
  });
});
