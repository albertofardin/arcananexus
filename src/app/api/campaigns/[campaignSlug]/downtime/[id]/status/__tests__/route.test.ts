import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { PATCH } from "../route";
import { mockCampaign, mockCharacter } from "@/test/helpers/prisma-fixtures";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("@/lib/db", () => {
  const mockPrisma = {
    campaign: { findFirst: vi.fn() },
    grant: { findUnique: vi.fn() },
    character: { findMany: vi.fn() },
    action: { findFirst: vi.fn(), update: vi.fn() },
    notification: { create: vi.fn() },
  };
  // `updateDowntimeStatus` (T-0xx, notifica al giocatore quando il master
  // cambia stato) avvolge lo `update` in una transazione — il "tx" passato
  // al callback è lo stesso oggetto mockato sopra, così
  // `prisma.action.update`/`prisma.notification.create` restano gli stessi
  // mock su cui i test già asseriscono, nessun secondo set di spy da
  // gestire.
  return {
    prisma: {
      ...mockPrisma,
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback(mockPrisma)
      ),
    },
  };
});

const buildParams = (campaignSlug: string, id: string) => ({
  params: Promise.resolve({ campaignSlug, id }),
});

function buildRequest(body?: unknown) {
  return new NextRequest(
    "http://localhost/api/campaigns/campaign-a/downtime/1/status",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }
  );
}

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
};

function asMaster() {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: "user-master", email: "master@example.com" },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue({
    userId: "user-master",
    campaignId: 1,
    role: Role.master,
  });
}

function asPlayer(userId: string) {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: userId, email: `${userId}@example.com` },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue(null);
}

const downtimeAction = (overrides?: {
  status?: string;
  response?: string | null;
}) => ({
  id: 1,
  characterId: 10,
  featureId: 5,
  creationDate: new Date("2024-06-01"),
  actionData: {
    subject: "Indagini in città",
    description: "<p>Ho lavorato in miniera</p>",
    readDate: null,
    status: overrides?.status ?? "waiting",
    response: overrides?.response ?? null,
  },
  character: {
    id: 10,
    name: "Aldric",
    avatar: null,
    user: { name: "Mario Rossi" },
  },
  feature: {
    featureType: { functionName: "downtimeWork", featureName: "Lavorare" },
  },
});

describe("PATCH /api/campaigns/[campaignSlug]/downtime/[id]/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildRequest({ status: "approve" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for a non-numeric id", async () => {
    asMaster();

    const response = await PATCH(
      buildRequest({ status: "approve" }),
      buildParams("campaign-a", "abc")
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for an invalid body", async () => {
    asMaster();

    const response = await PATCH(
      buildRequest({ status: "not-a-status" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when the body is not valid JSON", async () => {
    asMaster();

    const response = await PATCH(
      buildRequest(undefined),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown campaign slug", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildRequest({ status: "approve" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the downtime is not visible to the caller", async () => {
    asPlayer("user-stranger");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      mockCharacter({ id: 30, campaignId: 1, userId: "user-stranger" }),
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildRequest({ status: "approve" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(404);
    expect(prisma.action.update).not.toHaveBeenCalled();
  });

  it("returns 403 when a player, even owning the downtime's own character, tries to change the status", async () => {
    // "user-1" possiede il PG 10 (l'autore di `downtimeAction`): la vede
    // (è la sua), ma non può cambiarne lo stato — solo un master può.
    asPlayer("user-1");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      mockCharacter({ id: 10, campaignId: 1, userId: "user-1" }),
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(downtimeAction());

    const response = await PATCH(
      buildRequest({ status: "approve" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(403);
    expect(prisma.action.update).not.toHaveBeenCalled();
  });

  it("updates the status for a master, preserving subject/description already saved", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findFirst as Mock).mockResolvedValue(downtimeAction());

    const response = await PATCH(
      buildRequest({ status: "approve", response: "<p>Ottimo lavoro</p>" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: "approve",
      response: "<p>Ottimo lavoro</p>",
      masterNote: null,
      updateDate: expect.any(String),
    });
    expect(prisma.action.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        actionData: expect.objectContaining({
          subject: "Indagini in città",
          description: "<p>Ho lavorato in miniera</p>",
          status: "approve",
          response: "<p>Ottimo lavoro</p>",
          updateDate: expect.any(String),
        }),
      },
    });
  });

  it("allows a master to change the status again, not just once", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findFirst as Mock).mockResolvedValue(
      downtimeAction({ status: "approve", response: "<p>Prima risposta</p>" })
    );

    const response = await PATCH(
      buildRequest({ status: "refuse" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: "refuse",
      response: null,
      masterNote: null,
      updateDate: expect.any(String),
    });
  });

  it("saves a masterNote alongside the status, never rejected by the schema", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findFirst as Mock).mockResolvedValue(downtimeAction());

    const response = await PATCH(
      buildRequest({
        status: "approve",
        masterNote: "<p>Nota riservata allo staff</p>",
      }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.masterNote).toBe("<p>Nota riservata allo staff</p>");
    expect(prisma.action.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        actionData: expect.objectContaining({
          masterNote: "<p>Nota riservata allo staff</p>",
        }),
      },
    });
  });
});
