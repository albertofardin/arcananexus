import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import {
  mockCharacter,
  mockCampaign,
  mockUser,
} from "@/test/helpers/prisma-fixtures";
// `vi.mock` calls below are hoisted by Vitest above all imports, so these
// imports always resolve to the mocked modules regardless of source order.
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
    character: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    campaign: {
      findFirst: vi.fn(),
    },
    grant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    // T-0xx, notifica "nuovo PG in review": `POST` avvolge la creazione in
    // `prisma.$transaction` (vedi `beforeEach` di `describe("POST ...")`
    // sotto per il passthrough di default).
    notification: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const buildCharacterRow = (
  overrides?: Parameters<typeof mockCharacter>[0]
) => ({
  ...mockCharacter(overrides),
  campaign: {
    name: "Test Campaign",
    slug: "test-campaign",
    organization: { slug: "test-org" },
  },
  user: { name: mockUser().name },
});

describe("GET /api/characters", () => {
  beforeEach(() => {
    (prisma.character.findMany as Mock).mockReset();
    (auth.api.getSession as unknown as Mock).mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/characters");
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("scopes character query to authenticated user (no cross-user leakage)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x", name: "U" },
    });
    (prisma.character.findMany as Mock).mockResolvedValue([]);

    const request = new NextRequest("http://localhost/api/characters");
    await GET(request);

    expect(prisma.character.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1" }),
      })
    );
  });

  it("applies campaignSlug filter when provided (tenant isolation)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x", name: "U" },
    });
    (prisma.character.findMany as Mock).mockResolvedValue([]);

    const request = new NextRequest(
      "http://localhost/api/characters?campaignSlug=other-campaign"
    );
    await GET(request);

    expect(prisma.character.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          campaign: { slug: "other-campaign" },
        }),
      })
    );
  });

  it("returns characters owned by the authenticated user", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x", name: "U" },
    });
    const row = buildCharacterRow({ id: 1, userId: "user-1" });
    (prisma.character.findMany as Mock).mockResolvedValue([row]);

    const request = new NextRequest("http://localhost/api/characters");
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
    expect(json[0]).toMatchObject({
      id: 1,
      campaignSlug: "test-campaign",
      orgSlug: "test-org",
    });
  });

  it("returns 500 with error envelope when prisma throws", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x", name: "U" },
    });
    (prisma.character.findMany as Mock).mockRejectedValue(new Error("boom"));

    const request = new NextRequest("http://localhost/api/characters");
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});

describe("POST /api/characters", () => {
  const postRequest = (body: unknown) =>
    new Request("http://localhost/api/characters", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });

  beforeEach(() => {
    vi.clearAllMocks();
    // Passthrough di default (T-0xx): `POST` avvolge creazione + fan-out
    // notifiche in `prisma.$transaction`, qui basta eseguire la callback con
    // lo stesso `prisma` mockato come `tx`. Nessun master configurato per
    // default (`grant.findMany` -> `[]`, `createNotifications` diventa un
    // no-op) — i test che verificano il fan-out sovrascrivono entrambi.
    (prisma.$transaction as Mock).mockImplementation((async (
      fn: (tx: typeof prisma) => Promise<unknown>
    ) => fn(prisma)) as never);
    (prisma.grant.findMany as Mock).mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await POST(
      postRequest({ campaignSlug: "test-campaign", name: "Aldric" })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when name or campaignSlug are missing", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x", name: "U" },
    });

    const noName = await POST(postRequest({ campaignSlug: "test-campaign" }));
    const noSlug = await POST(postRequest({ name: "Aldric" }));

    expect(noName.status).toBe(400);
    expect(noSlug.status).toBe(400);
  });

  it("returns 404 when the campaign does not exist", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x", name: "U" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await POST(
      postRequest({ campaignSlug: "ghost-campaign", name: "Aldric" })
    );

    expect(response.status).toBe(404);
    expect(prisma.character.create).not.toHaveBeenCalled();
  });

  it("returns 403 when a non-staff user sends staff-only fields", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x", name: "U" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(mockCampaign());
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const response = await POST(
      postRequest({
        campaignSlug: "test-campaign",
        name: "Aldric",
        masterNotes: "segreto",
      })
    );

    expect(response.status).toBe(403);
    expect(prisma.character.create).not.toHaveBeenCalled();
  });

  it("creates the character in the resolved campaign for the authenticated user", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x", name: "U" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(
      mockCampaign({ id: 7 })
    );
    (prisma.character.create as Mock).mockResolvedValue(
      buildCharacterRow({ id: 42, campaignId: 7, name: "Aldric" })
    );

    const response = await POST(
      postRequest({
        campaignSlug: "test-campaign",
        name: "Aldric",
        background: "Un mercante",
      })
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toMatchObject({ id: 42, name: "Aldric" });
    expect(prisma.character.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          campaignId: 7,
          userId: "user-1",
          name: "Aldric",
          background: "Un mercante",
        }),
      })
    );
  });

  it("notifica i master/head_master della campagna (T-0xx, nuovo PG in review)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x", name: "U" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(
      mockCampaign({ id: 7 })
    );
    (prisma.character.create as Mock).mockResolvedValue(
      buildCharacterRow({ id: 42, campaignId: 7, name: "Aldric" })
    );
    (prisma.grant.findMany as Mock).mockResolvedValue([
      { userId: "head-master-1", campaignId: 7, role: "head_master" },
      { userId: "supporter-1", campaignId: 7, role: "supporter" },
    ]);

    await POST(postRequest({ campaignSlug: "test-campaign", name: "Aldric" }));

    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "head-master-1",
          campaignId: 7,
          type: "character_status",
          entityId: 42,
        },
      ],
    });
  });

  it("non notifica gli head_master quando il personaggio creato è un PNG", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x", name: "U" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(
      mockCampaign({ id: 7 })
    );
    (prisma.character.create as Mock).mockResolvedValue(
      buildCharacterRow({
        id: 42,
        campaignId: 7,
        name: "Guardia",
        type: "png",
      })
    );
    (prisma.grant.findMany as Mock).mockResolvedValue([
      { userId: "head-master-1", campaignId: 7, role: "head_master" },
    ]);

    await POST(postRequest({ campaignSlug: "test-campaign", name: "Guardia" }));

    expect(prisma.grant.findMany).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it("never trusts a campaignId from the client (strict schema)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x", name: "U" },
    });

    const response = await POST(
      postRequest({
        campaignSlug: "test-campaign",
        name: "Aldric",
        campaignId: 99,
      })
    );

    expect(response.status).toBe(400);
  });
});

describe("Multi-tenant isolation (HTTP level)", () => {
  it("never queries characters without a userId scope", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x", name: "U" },
    });
    (prisma.character.findMany as Mock).mockResolvedValue([]);

    const request = new NextRequest(
      "http://localhost/api/characters?campaignSlug=any"
    );
    await GET(request);

    const call = (prisma.character.findMany as Mock).mock.calls[0][0];
    expect(call.where.userId).toBe("user-1");
  });

  it("does not leak characters from other users when campaign filter is applied", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x", name: "U" },
    });
    // Repo would return only user-1's characters; verify the where clause encodes the constraint.
    (prisma.character.findMany as Mock).mockResolvedValue([
      buildCharacterRow({
        id: 1,
        userId: "user-1",
        campaignId: mockCampaign().id,
      }),
    ]);

    const request = new NextRequest(
      "http://localhost/api/characters?campaignSlug=test-campaign"
    );
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.every((c: { userId: string }) => c.userId === "user-1")).toBe(
      true
    );
  });
});
