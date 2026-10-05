import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";
// `vi.mock` calls below are hoisted by Vitest above all imports, so these
// imports always resolve to the mocked modules regardless of source order.
import { prisma } from "@/lib/db";
import { getEffectiveUserId } from "@/lib/authorization";

// Solo `getEffectiveUserId` (impersonation-aware) è mockato: `getUserGroupFlags`
// resta l'implementazione reale (pura, non serve isolarla) per esercitare la
// logica effettiva della route.
vi.mock("@/lib/authorization", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/authorization")>();
  return {
    ...actual,
    getEffectiveUserId: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    grant: {
      findMany: vi.fn(),
    },
  },
}));

describe("GET /api/me/capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no effective user (no session)", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/me/capabilities");
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("returns 404 when the effective user no longer exists", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("ghost");
    (prisma.user.findUnique as Mock).mockResolvedValue(null);
    // `getMasterCampaignSlugs` gira comunque in parallelo con
    // `user.findUnique` (nessuna delle due dipende dall'altra): un utente
    // "ghost" non ha comunque Grant, quindi un array vuoto è il risultato
    // reale atteso su Postgres.
    (prisma.grant.findMany as Mock).mockResolvedValue([]);

    const request = new NextRequest("http://localhost/api/me/capabilities");
    const response = await GET(request);

    expect(response.status).toBe(404);
  });

  it("returns full capabilities for a hardcoded sviluppo email", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("sviluppo-1");
    (prisma.user.findUnique as Mock).mockResolvedValue({
      email: "mattia@arcana.it",
      isDirettivo: false,
      isSviluppo: false,
    });
    (prisma.grant.findMany as Mock).mockResolvedValue([
      { campaign: { slug: "campaign-a" } },
    ]);

    const request = new NextRequest("http://localhost/api/me/capabilities");
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      isDirettivo: false,
      isSviluppo: true,
      masterCampaigns: ["campaign-a"],
    });
  });

  it("returns isDirettivo true for a direttivo member (isSviluppo false)", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (prisma.user.findUnique as Mock).mockResolvedValue({
      email: "secretary@example.com",
      isDirettivo: true,
      isSviluppo: false,
    });
    (prisma.grant.findMany as Mock).mockResolvedValue([]);

    const request = new NextRequest("http://localhost/api/me/capabilities");
    const response = await GET(request);
    const json = await response.json();

    expect(json).toEqual({
      isDirettivo: true,
      isSviluppo: false,
      masterCampaigns: [],
    });
  });

  it("returns all flags false for a plain user", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-2");
    (prisma.user.findUnique as Mock).mockResolvedValue({
      email: "member@example.com",
      isDirettivo: false,
      isSviluppo: false,
    });
    (prisma.grant.findMany as Mock).mockResolvedValue([]);

    const request = new NextRequest("http://localhost/api/me/capabilities");
    const response = await GET(request);
    const json = await response.json();

    expect(json).toEqual({
      isDirettivo: false,
      isSviluppo: false,
      masterCampaigns: [],
    });
  });

  it("returns the slugs of campaigns where the user is master or head_master", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-3");
    (prisma.user.findUnique as Mock).mockResolvedValue({
      email: "headmaster@example.com",
      isDirettivo: false,
      isSviluppo: false,
    });
    (prisma.grant.findMany as Mock).mockResolvedValue([
      { campaign: { slug: "campaign-x" } },
      { campaign: { slug: "campaign-y" } },
    ]);

    const request = new NextRequest("http://localhost/api/me/capabilities");
    const response = await GET(request);
    const json = await response.json();

    expect(json.masterCampaigns).toEqual(["campaign-x", "campaign-y"]);
  });
});
