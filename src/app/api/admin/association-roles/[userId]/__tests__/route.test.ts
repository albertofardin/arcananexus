import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { DELETE } from "../route";
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
      update: vi.fn(),
    },
  },
}));

const buildParams = (userId: string) => ({
  params: Promise.resolve({ userId }),
});

function buildRequest(userId: string, group?: string) {
  const qs = group ? `?group=${group}` : "";
  return new NextRequest(
    `http://localhost/api/admin/association-roles/${userId}${qs}`,
    { method: "DELETE" }
  );
}

// `getUserGroupFlags` (guardia isDirettivo/isSviluppo del chiamante) e
// `getUserEmailById` (email dell'utente target, solo per group=sviluppo) usano
// entrambe `prisma.user.findUnique`: distinguiamo per id nel mock.
function mockUsersById(
  users: Record<
    string,
    { email: string; isDirettivo?: boolean; isSviluppo?: boolean }
  >
) {
  (prisma.user.findUnique as Mock).mockImplementation(
    ({ where }: { where: { id: string } }) => {
      const user = users[where.id];
      if (!user) return Promise.resolve(null);
      return Promise.resolve({
        email: user.email,
        isDirettivo: user.isDirettivo ?? false,
        isSviluppo: user.isSviluppo ?? false,
      });
    }
  );
}

describe("DELETE /api/admin/association-roles/[userId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await DELETE(
      buildRequest("user-2", "direttivo"),
      buildParams("user-2")
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 for a user who is neither direttivo nor sviluppo web", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "not-admin@example.com" },
    });
    mockUsersById({ "user-1": { email: "not-admin@example.com" } });

    const response = await DELETE(
      buildRequest("user-2", "direttivo"),
      buildParams("user-2")
    );

    expect(response.status).toBe(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 when the group query param is missing or invalid", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "secretary@example.com" },
    });
    mockUsersById({
      "user-1": { email: "secretary@example.com", isDirettivo: true },
    });

    const response = await DELETE(
      buildRequest("user-2"),
      buildParams("user-2")
    );

    expect(response.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("removes a user from direttivo for a direttivo member (non sviluppo web)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "secretary@example.com" },
    });
    mockUsersById({
      "user-1": { email: "secretary@example.com", isDirettivo: true },
      "user-2": { email: "target@example.com", isDirettivo: true },
    });
    (prisma.user.update as Mock).mockResolvedValue({
      id: "user-2",
      isDirettivo: false,
    });

    const response = await DELETE(
      buildRequest("user-2", "direttivo"),
      buildParams("user-2")
    );

    expect(response.status).toBe(204);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: { isDirettivo: false },
    });
  });

  it("returns 403 for a direttivo member (non sviluppo web) trying to remove a user from sviluppo web", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "secretary@example.com" },
    });
    mockUsersById({
      "user-1": { email: "secretary@example.com", isDirettivo: true },
    });

    const response = await DELETE(
      buildRequest("user-2", "sviluppo"),
      buildParams("user-2")
    );

    expect(response.status).toBe(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("allows a hardcoded sviluppo email to remove a non-cabled user from sviluppo web", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockUsersById({
      "user-1": { email: "mattia@arcana.it" },
      "user-2": { email: "target@example.com", isSviluppo: true },
    });
    (prisma.user.update as Mock).mockResolvedValue({
      id: "user-2",
      isSviluppo: false,
    });

    const response = await DELETE(
      buildRequest("user-2", "sviluppo"),
      buildParams("user-2")
    );

    expect(response.status).toBe(204);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: { isSviluppo: false },
    });
  });

  it("returns 403 when a sviluppo user tries to remove a hardcoded sviluppo email from sviluppo web", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "mattia@arcana.it" },
    });
    mockUsersById({
      "user-1": { email: "mattia@arcana.it" },
      "user-2": { email: "prevalentementealberto@gmail.com" },
    });

    const response = await DELETE(
      buildRequest("user-2", "sviluppo"),
      buildParams("user-2")
    );

    expect(response.status).toBe(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
