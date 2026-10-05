import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";
// `vi.mock` calls below are hoisted by Vitest above all imports, so questi
// import risolvono sempre ai moduli mockati indipendentemente dall'ordine.
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ensureFeatureTypesRegistered } from "@/lib/features";
import { mockFeatureType } from "@/test/helpers/prisma-fixtures";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    featureType: {
      findMany: vi.fn(),
    },
  },
}));

// Auto-provisioning (fix bug T-019 follow-up, feature assenti su staging):
// mockato qui perché coinvolge il registry reale (`@/lib/features`), non
// interessante per il comportamento HTTP di questa route — solo che venga
// chiamato prima della lettura del catalogo.
vi.mock("@/lib/features", () => ({
  ensureFeatureTypesRegistered: vi.fn(),
}));

describe("GET /api/feature-types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/feature-types");
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("returns the platform-wide feature type catalog for any authenticated user", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    const rows = [
      mockFeatureType({ id: 1, functionName: "talents" }),
      mockFeatureType({ id: 2, functionName: "deathXpRecovery" }),
    ];
    (prisma.featureType.findMany as Mock).mockResolvedValue(rows);

    const request = new NextRequest("http://localhost/api/feature-types");
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(rows);
    // Nessuno scoping a campagna/ruolo: la query non filtra per organizzazione.
    expect(prisma.featureType.findMany).toHaveBeenCalledWith({
      orderBy: { featureName: "asc" },
    });
    // Auto-provisioning: il catalogo va allineato al registry prima di
    // leggerlo, non solo popolato dal seed (fix bug staging vs locale).
    expect(ensureFeatureTypesRegistered).toHaveBeenCalledWith(prisma);
  });
});
