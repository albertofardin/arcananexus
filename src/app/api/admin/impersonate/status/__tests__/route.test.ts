import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";
// `vi.mock` è hoisted sopra gli import: questo import risolve sempre al modulo mockato.
import { getSessionContext } from "@/lib/impersonation";

// `getSessionContext` è testato a fondo (con cookie realmente firmati) in
// src/lib/impersonation.test.ts: qui viene mockato per isolare la sola
// logica di serializzazione della route.
vi.mock("@/lib/impersonation", () => ({
  getSessionContext: vi.fn(),
}));

function getRequest() {
  return new NextRequest("http://localhost/api/admin/impersonate/status");
}

describe("GET /api/admin/impersonate/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    (getSessionContext as unknown as Mock).mockResolvedValue(null);

    const response = await GET(getRequest());

    expect(response.status).toBe(401);
  });

  it("returns isImpersonating: false and adminUser: null outside an impersonation", async () => {
    (getSessionContext as unknown as Mock).mockResolvedValue({
      isImpersonating: false,
      activeUser: { id: "admin-1", name: "Admin", email: "mattia@arcana.it" },
    });

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      isImpersonating: false,
      activeUser: { id: "admin-1", name: "Admin", email: "mattia@arcana.it" },
      adminUser: null,
    });
  });

  it("returns isImpersonating: true with both users during an impersonation", async () => {
    (getSessionContext as unknown as Mock).mockResolvedValue({
      isImpersonating: true,
      activeUser: {
        id: "target-1",
        name: "Target",
        email: "target@example.com",
      },
      adminUser: { id: "admin-1", name: "Admin", email: "mattia@arcana.it" },
    });

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      isImpersonating: true,
      activeUser: {
        id: "target-1",
        name: "Target",
        email: "target@example.com",
      },
      adminUser: { id: "admin-1", name: "Admin", email: "mattia@arcana.it" },
    });
  });
});
