import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { APIError } from "better-auth/api";
import { POST } from "../route";
// `vi.mock` calls below are hoisted by Vitest above all imports, so these
// imports always resolve to the mocked modules regardless of source order.
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
      impersonateUser: vi.fn(),
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

const SUPER_ADMIN_SESSION = {
  user: { id: "admin-1", email: "mattia@arcana.it", role: "admin" },
  session: { token: "admin-session-token" },
};

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/impersonate/start", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// `getUserGroupFlags` (guardia isSviluppo) e la lookup dell'utente target usano
// entrambe `prisma.user.findUnique`: distinguiamo per id nel mock.
function mockUsersById(
  users: Record<
    string,
    {
      email: string;
      isDirettivo?: boolean;
      isSviluppo?: boolean;
      name?: string;
    }
  >
) {
  (prisma.user.findUnique as Mock).mockImplementation(
    ({ where }: { where: { id: string } }) => {
      const user = users[where.id];
      if (!user) return Promise.resolve(null);
      return Promise.resolve({
        id: where.id,
        name: user.name ?? "User",
        email: user.email,
        isDirettivo: user.isDirettivo ?? false,
        isSviluppo: user.isSviluppo ?? false,
      });
    }
  );
}

describe("POST /api/admin/impersonate/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await POST(postRequest({ targetUserId: "target-1" }));

    expect(response.status).toBe(401);
    expect(auth.api.impersonateUser).not.toHaveBeenCalled();
  });

  it("returns 403 for a user who is not sviluppo web", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "not-admin@example.com" },
      session: { token: "token" },
    });
    mockUsersById({ "user-1": { email: "not-admin@example.com" } });

    const response = await POST(postRequest({ targetUserId: "target-1" }));

    expect(response.status).toBe(403);
    expect(auth.api.impersonateUser).not.toHaveBeenCalled();
  });

  it("returns 403 for a direttivo member who is not sviluppo web (impersonation is sviluppo only)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "president@example.com" },
      session: { token: "token" },
    });
    mockUsersById({
      "user-1": { email: "president@example.com", isDirettivo: true },
    });

    const response = await POST(postRequest({ targetUserId: "target-1" }));

    expect(response.status).toBe(403);
    expect(auth.api.impersonateUser).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(
      SUPER_ADMIN_SESSION
    );
    mockUsersById({ "admin-1": { email: "mattia@arcana.it" } });

    const response = await POST(postRequest({ targetUserId: "" }));

    expect(response.status).toBe(400);
  });

  it("returns 400 when trying to impersonate itself", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(
      SUPER_ADMIN_SESSION
    );
    mockUsersById({ "admin-1": { email: "mattia@arcana.it" } });

    const response = await POST(postRequest({ targetUserId: "admin-1" }));

    expect(response.status).toBe(400);
    expect(auth.api.impersonateUser).not.toHaveBeenCalled();
  });

  it("returns 404 when the target user does not exist", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(
      SUPER_ADMIN_SESSION
    );
    mockUsersById({ "admin-1": { email: "mattia@arcana.it" } });

    const response = await POST(postRequest({ targetUserId: "ghost" }));

    expect(response.status).toBe(404);
    expect(auth.api.impersonateUser).not.toHaveBeenCalled();
  });

  it("starts the impersonation and propagates the Set-Cookie headers written by the admin plugin", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(
      SUPER_ADMIN_SESSION
    );
    mockUsersById({
      "admin-1": { email: "mattia@arcana.it" },
      "target-1": { email: "target@example.com", name: "Target User" },
    });
    // Le firma/scrittura reali dei cookie sono già coperte a un livello più
    // basso (src/lib/impersonation.test.ts, con un'istanza Better Auth
    // vera): qui verifichiamo solo che la route propaghi correttamente
    // quello che il plugin restituisce, il punto esatto del bug P0 (i cookie
    // scritti a mano dalla vecchia implementazione non erano firmati).
    (auth.api.impersonateUser as unknown as Mock).mockResolvedValue({
      headers: new Headers([
        [
          "set-cookie",
          "better-auth.session_token=; Max-Age=0; Path=/; HttpOnly",
        ],
        [
          "set-cookie",
          "better-auth.admin_session=signed-admin-cookie; Path=/; HttpOnly",
        ],
        [
          "set-cookie",
          "better-auth.session_token=signed-target-cookie; Path=/; HttpOnly",
        ],
      ]),
      response: { session: {}, user: {} },
    });

    const response = await POST(postRequest({ targetUserId: "target-1" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      targetUser: {
        id: "target-1",
        name: "Target User",
        email: "target@example.com",
      },
    });
    expect(auth.api.impersonateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { userId: "target-1" },
        returnHeaders: true,
      })
    );
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toContain(
      "better-auth.session_token=; Max-Age=0; Path=/; HttpOnly"
    );
    expect(setCookies).toContain(
      "better-auth.admin_session=signed-admin-cookie; Path=/; HttpOnly"
    );
    expect(setCookies).toContain(
      "better-auth.session_token=signed-target-cookie; Path=/; HttpOnly"
    );
    // Il chiamante ha già `role: "admin"` in sessione (vedi
    // SUPER_ADMIN_SESSION): nessuna scrittura di sync necessaria.
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("syncs role to 'admin' before delegating to the plugin, for an isSviluppo user whose Better Auth role isn't set yet (root cause of the dev/prod hardcoded-id bug)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "sviluppo-1", email: "dev@example.com" }, // role assente
      session: { token: "token" },
    });
    mockUsersById({
      "sviluppo-1": { email: "dev@example.com", isSviluppo: true },
      "target-1": { email: "target@example.com", name: "Target User" },
    });
    (auth.api.impersonateUser as unknown as Mock).mockResolvedValue({
      headers: new Headers(),
      response: { session: {}, user: {} },
    });

    const response = await POST(postRequest({ targetUserId: "target-1" }));

    expect(response.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "sviluppo-1" },
      data: { role: "admin" },
    });
  });

  it("maps an APIError raised by the admin plugin (e.g. YOU_CANNOT_IMPERSONATE_ADMINS) to its status code", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(
      SUPER_ADMIN_SESSION
    );
    mockUsersById({
      "admin-1": { email: "mattia@arcana.it" },
      "target-1": { email: "target@example.com", name: "Target User" },
    });
    (auth.api.impersonateUser as unknown as Mock).mockRejectedValue(
      new APIError(
        "FORBIDDEN",
        { message: "You cannot impersonate other admins" },
        undefined,
        403
      )
    );

    const response = await POST(postRequest({ targetUserId: "target-1" }));

    expect(response.status).toBe(403);
  });

  it("returns 500 for an unexpected error", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(
      SUPER_ADMIN_SESSION
    );
    mockUsersById({
      "admin-1": { email: "mattia@arcana.it" },
      "target-1": { email: "target@example.com", name: "Target User" },
    });
    (auth.api.impersonateUser as unknown as Mock).mockRejectedValue(
      new Error("boom")
    );

    const response = await POST(postRequest({ targetUserId: "target-1" }));

    expect(response.status).toBe(500);
  });
});
