import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";
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
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    membership: {
      findMany: vi.fn(),
    },
  },
}));

// Helper: la guardia `requireAdminSectionAccess` legge i flag di gruppo
// dell'utente via `prisma.user.findUnique` prima ancora della query di
// `listUsersForAdmin`.
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

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/admin/users");
    const response = await GET(request, {});

    expect(response.status).toBe(401);
  });

  it("returns 403 for a plain user (not direttivo, not sviluppo web)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "not-admin@example.com" },
    });
    mockGroupFlags("not-admin@example.com");

    const request = new NextRequest("http://localhost/api/admin/users");
    const response = await GET(request, {});

    expect(response.status).toBe(403);
  });

  it("allows a direttivo member without the sviluppo flag", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "president@example.com" },
    });
    mockGroupFlags("president@example.com", { isDirettivo: true });
    (prisma.user.findMany as Mock).mockResolvedValue([]);
    (prisma.user.count as Mock).mockResolvedValue(0);
    (prisma.membership.findMany as Mock).mockResolvedValue([]);

    const request = new NextRequest("http://localhost/api/admin/users");
    const response = await GET(request, {});

    expect(response.status).toBe(200);
  });

  it("returns users, availableYears and pagination for a hardcoded sviluppo email", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it");
    (prisma.user.findMany as Mock).mockResolvedValue([
      {
        id: "user-2",
        name: "Alice",
        email: "alice@example.com",
        emailVerified: true,
        image: null,
        createdAt: new Date("2024-01-01"),
        PersonalData: null,
        Membership: [{ year: 2025 }],
      },
    ]);
    (prisma.user.count as Mock).mockResolvedValue(1);
    (prisma.membership.findMany as Mock).mockResolvedValue([{ year: 2025 }]);

    const request = new NextRequest(
      "http://localhost/api/admin/users?search=ali&page=1&pageSize=20"
    );
    const response = await GET(request, {});
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.users).toEqual([
      {
        id: "user-2",
        name: "Alice",
        email: "alice@example.com",
        emailVerified: true,
        image: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        personalData: null,
        membershipYears: [2025],
      },
    ]);
    expect(json.availableYears).toEqual([2025]);
    expect(json.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it("forwards search/year/pagination query params to the repository", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it");
    (prisma.user.findMany as Mock).mockResolvedValue([]);
    (prisma.user.count as Mock).mockResolvedValue(0);
    (prisma.membership.findMany as Mock).mockResolvedValue([]);

    const request = new NextRequest(
      "http://localhost/api/admin/users?search=bob&year=2025&page=2&pageSize=10"
    );
    await GET(request, {});

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: "bob", mode: "insensitive" } },
            { email: { contains: "bob", mode: "insensitive" } },
          ],
          Membership: { some: { year: 2025 } },
        },
        skip: 10,
        take: 10,
      })
    );
  });

  it("returns 400 for a non-numeric page, without hitting the repository", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it");

    const request = new NextRequest(
      "http://localhost/api/admin/users?page=abc"
    );
    const response = await GET(request, {});

    expect(response.status).toBe(400);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 for pageSize=0 (must be positive)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it");

    const request = new NextRequest(
      "http://localhost/api/admin/users?pageSize=0"
    );
    const response = await GET(request, {});

    expect(response.status).toBe(400);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 for a pageSize above the 100 cap (no unbounded query)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it");

    const request = new NextRequest(
      "http://localhost/api/admin/users?pageSize=1000000"
    );
    const response = await GET(request, {});

    expect(response.status).toBe(400);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-numeric year", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it");

    const request = new NextRequest(
      "http://localhost/api/admin/users?year=abc"
    );
    const response = await GET(request, {});

    expect(response.status).toBe(400);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("applies the default page/pageSize when omitted", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it");
    (prisma.user.findMany as Mock).mockResolvedValue([]);
    (prisma.user.count as Mock).mockResolvedValue(0);
    (prisma.membership.findMany as Mock).mockResolvedValue([]);

    const request = new NextRequest("http://localhost/api/admin/users");
    const response = await GET(request, {});
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.pagination).toEqual({
      page: 1,
      pageSize: 50,
      total: 0,
      totalPages: 0,
    });
  });
});
