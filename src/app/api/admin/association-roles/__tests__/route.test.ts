import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../route";
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
      update: vi.fn(),
    },
    campaign: {
      findMany: vi.fn().mockResolvedValue([]),
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

describe("GET /api/admin/association-roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/admin/association-roles"
    );
    const response = await GET(request, {});

    expect(response.status).toBe(401);
  });

  it("returns 403 for a user who is neither direttivo nor sviluppo web", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "not-admin@example.com" },
    });
    mockGroupFlags("not-admin@example.com");

    const request = new NextRequest(
      "http://localhost/api/admin/association-roles"
    );
    const response = await GET(request, {});

    expect(response.status).toBe(403);
  });

  it("returns users plus both group member lists for a direttivo member (non sviluppo web)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "secretary@example.com" },
    });
    mockGroupFlags("secretary@example.com", { isDirettivo: true });
    (prisma.user.findMany as Mock)
      .mockResolvedValueOnce([
        {
          id: "user-2",
          name: "User Two",
          email: "u2@example.com",
          image: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "user-1",
          name: "Secretary",
          email: "secretary@example.com",
          image: null,
          isDirettivo: true,
        },
      ])
      .mockResolvedValueOnce([]);

    const request = new NextRequest(
      "http://localhost/api/admin/association-roles"
    );
    const response = await GET(request, {});
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.users).toEqual([
      { id: "user-2", name: "User Two", email: "u2@example.com", image: null },
    ]);
    expect(json.direttivoMemberIds).toEqual(["user-1"]);
    expect(json.sviluppoMemberIds).toEqual([]);
    expect(json.campaigns).toEqual([]);
  });

  it("returns both group member lists for a hardcoded sviluppo email", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it");
    (prisma.user.findMany as Mock)
      .mockResolvedValueOnce([
        {
          id: "user-2",
          name: "User Two",
          email: "u2@example.com",
          image: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "user-3",
          name: "Board Member",
          email: "board@example.com",
          image: null,
          isDirettivo: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "user-1",
          name: "Dev Web",
          email: "mattia@arcana.it",
          image: null,
          isSviluppo: true,
        },
      ]);

    const request = new NextRequest(
      "http://localhost/api/admin/association-roles"
    );
    const response = await GET(request, {});
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.users).toEqual([
      { id: "user-2", name: "User Two", email: "u2@example.com", image: null },
    ]);
    expect(json.direttivoMemberIds).toEqual(["user-3"]);
    expect(json.sviluppoMemberIds).toEqual(["user-1"]);
  });
});

describe("POST /api/admin/association-roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/admin/association-roles",
      {
        method: "POST",
        body: JSON.stringify({ userId: "user-2", group: "direttivo" }),
      }
    );
    const response = await POST(request, {});

    expect(response.status).toBe(401);
  });

  it("returns 403 for a user who is neither direttivo nor sviluppo web", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "not-admin@example.com" },
    });
    mockGroupFlags("not-admin@example.com");

    const request = new NextRequest(
      "http://localhost/api/admin/association-roles",
      {
        method: "POST",
        body: JSON.stringify({ userId: "user-2", group: "direttivo" }),
      }
    );
    const response = await POST(request, {});

    expect(response.status).toBe(403);
  });

  it("returns 201 for a direttivo member (non sviluppo web) adding another user to direttivo", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "secretary@example.com" },
    });
    mockGroupFlags("secretary@example.com", { isDirettivo: true });
    (prisma.user.update as Mock).mockResolvedValue({
      id: "user-2",
      isDirettivo: true,
      isSviluppo: false,
    });

    const request = new NextRequest(
      "http://localhost/api/admin/association-roles",
      {
        method: "POST",
        body: JSON.stringify({ userId: "user-2", group: "direttivo" }),
      }
    );
    const response = await POST(request, {});

    expect(response.status).toBe(201);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: { isDirettivo: true },
    });
  });

  it("returns 403 for a direttivo member (non sviluppo web) trying to add another user to sviluppo web", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "secretary@example.com" },
    });
    mockGroupFlags("secretary@example.com", { isDirettivo: true });

    const request = new NextRequest(
      "http://localhost/api/admin/association-roles",
      {
        method: "POST",
        body: JSON.stringify({ userId: "user-2", group: "sviluppo" }),
      }
    );
    const response = await POST(request, {});

    expect(response.status).toBe(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid input", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it");

    const request = new NextRequest(
      "http://localhost/api/admin/association-roles",
      {
        method: "POST",
        body: JSON.stringify({ userId: "", group: "direttivo" }),
      }
    );
    const response = await POST(request, {});

    expect(response.status).toBe(400);
  });

  it("returns 400 for an unknown group value", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it");

    const request = new NextRequest(
      "http://localhost/api/admin/association-roles",
      {
        method: "POST",
        body: JSON.stringify({ userId: "user-2", group: "board" }),
      }
    );
    const response = await POST(request, {});

    expect(response.status).toBe(400);
  });

  it("allows a hardcoded sviluppo email to add another user to sviluppo web", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockGroupFlags("mattia@arcana.it");
    (prisma.user.update as Mock).mockResolvedValue({
      id: "user-2",
      isDirettivo: false,
      isSviluppo: true,
    });

    const request = new NextRequest(
      "http://localhost/api/admin/association-roles",
      {
        method: "POST",
        body: JSON.stringify({ userId: "user-2", group: "sviluppo" }),
      }
    );
    const response = await POST(request, {});
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({
      userId: "user-2",
      group: "sviluppo",
      isDirettivo: false,
      isSviluppo: true,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: { isSviluppo: true },
    });
  });
});
