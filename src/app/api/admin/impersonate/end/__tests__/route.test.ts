import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { APIError } from "better-auth/api";
import { POST } from "../route";
// `vi.mock` calls below are hoisted by Vitest above all imports, so these
// imports always resolve to the mocked modules regardless of source order.
import { auth } from "@/lib/auth";
import { getSessionContext } from "@/lib/impersonation";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      stopImpersonating: vi.fn(),
    },
  },
}));

// `getSessionContext` è testato a fondo (con cookie realmente firmati) in
// src/lib/impersonation.test.ts: qui viene mockato per isolare la sola
// logica della route.
vi.mock("@/lib/impersonation", () => ({
  getSessionContext: vi.fn(),
}));

function postRequest() {
  return new NextRequest("http://localhost/api/admin/impersonate/end", {
    method: "POST",
  });
}

const IMPERSONATING_CONTEXT = {
  isImpersonating: true,
  activeUser: { id: "target-1", name: "Target", email: "target@example.com" },
  adminUser: { id: "admin-1", name: "Admin", email: "mattia@arcana.it" },
};

describe("POST /api/admin/impersonate/end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when there is no active session", async () => {
    (getSessionContext as unknown as Mock).mockResolvedValue(null);

    const response = await POST(postRequest());

    expect(response.status).toBe(400);
    expect(auth.api.stopImpersonating).not.toHaveBeenCalled();
  });

  it("returns 400 when the active session is not impersonating anyone", async () => {
    (getSessionContext as unknown as Mock).mockResolvedValue({
      isImpersonating: false,
      activeUser: { id: "admin-1", name: "Admin", email: "mattia@arcana.it" },
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(400);
    expect(auth.api.stopImpersonating).not.toHaveBeenCalled();
  });

  it("stops the impersonation and propagates the Set-Cookie headers written by the admin plugin", async () => {
    (getSessionContext as unknown as Mock).mockResolvedValue(
      IMPERSONATING_CONTEXT
    );
    (auth.api.stopImpersonating as unknown as Mock).mockResolvedValue({
      headers: new Headers([
        [
          "set-cookie",
          "better-auth.session_token=signed-admin-cookie; Path=/; HttpOnly",
        ],
        [
          "set-cookie",
          "better-auth.admin_session=; Max-Age=0; Path=/; HttpOnly",
        ],
      ]),
      response: { session: {}, user: {} },
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toContain(
      "better-auth.session_token=signed-admin-cookie; Path=/; HttpOnly"
    );
    expect(setCookies).toContain(
      "better-auth.admin_session=; Max-Age=0; Path=/; HttpOnly"
    );
  });

  it("maps an APIError raised by the admin plugin to its status code", async () => {
    (getSessionContext as unknown as Mock).mockResolvedValue(
      IMPERSONATING_CONTEXT
    );
    (auth.api.stopImpersonating as unknown as Mock).mockRejectedValue(
      new APIError(
        "BAD_REQUEST",
        { message: "You are not impersonating anyone" },
        undefined,
        400
      )
    );

    const response = await POST(postRequest());

    expect(response.status).toBe(400);
  });

  it("returns 500 for an unexpected error", async () => {
    (getSessionContext as unknown as Mock).mockResolvedValue(
      IMPERSONATING_CONTEXT
    );
    (auth.api.stopImpersonating as unknown as Mock).mockRejectedValue(
      new Error("boom")
    );

    const response = await POST(postRequest());

    expect(response.status).toBe(500);
  });
});
