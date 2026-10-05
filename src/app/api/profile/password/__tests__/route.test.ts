import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { APIError } from "better-auth/api";
import { POST } from "../route";
// Mock Better Auth: `callAuthEndpoint`/`readAuthEndpointResponse` sono il
// confine con Better Auth (instradano attraverso il router HTTP invece di
// `auth.api.changePassword` diretto, per beneficiare del suo rate-limit
// nativo, vedi review T-6 MAJOR #1).
vi.mock("@/lib/auth", () => ({
  callAuthEndpoint: vi.fn(),
  readAuthEndpointResponse: vi.fn(),
}));
// Mock impersonation: la route deve rifiutare l'operazione durante
// un'impersonificazione (review T-6, MAJOR #2).
vi.mock("@/lib/impersonation", () => ({
  getSessionContext: vi.fn(),
}));
// Import after mocks
import { callAuthEndpoint, readAuthEndpointResponse } from "@/lib/auth";
import { getSessionContext } from "@/lib/impersonation";

const activeUser = {
  id: "user-1",
  name: "Mario Rossi",
  email: "mario@example.com",
};

const adminUser = {
  id: "admin-1",
  name: "Admin",
  email: "mattia@arcana.it",
};

const notImpersonating = { isImpersonating: false as const, activeUser };
const impersonating = {
  isImpersonating: true as const,
  activeUser,
  adminUser,
};

// Non ha bisogno di essere una vera Response: `callAuthEndpoint` è mockato,
// quindi il valore risolto passa solo a `readAuthEndpointResponse` (anche
// lui mockato).
const fakeAuthResponse = {} as Response;

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/profile/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/profile/password", () => {
  beforeEach(() => {
    (getSessionContext as Mock).mockReset();
    (callAuthEndpoint as Mock).mockReset().mockResolvedValue(fakeAuthResponse);
    (readAuthEndpointResponse as Mock)
      .mockReset()
      .mockResolvedValue({ token: null });
  });

  it("should return 401 when user is not authenticated", async () => {
    (getSessionContext as Mock).mockResolvedValue(null);

    const response = await POST(
      makeRequest({
        currentPassword: "old-pass",
        newPassword: "new-password-123",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Not authenticated");
    expect(callAuthEndpoint).not.toHaveBeenCalled();
  });

  it("should return 403 when impersonating another user", async () => {
    (getSessionContext as Mock).mockResolvedValue(impersonating);

    const response = await POST(
      makeRequest({
        currentPassword: "old-pass",
        newPassword: "new-password-123",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe(
      "Operazione non consentita durante l'impersonificazione"
    );
    expect(callAuthEndpoint).not.toHaveBeenCalled();
  });

  it("should return 400 when the new password is too short", async () => {
    (getSessionContext as Mock).mockResolvedValue(notImpersonating);

    const response = await POST(
      makeRequest({ currentPassword: "old-pass", newPassword: "short" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid data");
    expect(callAuthEndpoint).not.toHaveBeenCalled();
  });

  it("should return 400 when the current password is missing", async () => {
    (getSessionContext as Mock).mockResolvedValue(notImpersonating);

    const response = await POST(
      makeRequest({ newPassword: "new-password-123" })
    );

    expect(response.status).toBe(400);
    expect(callAuthEndpoint).not.toHaveBeenCalled();
  });

  it("should route the change through Better Auth's HTTP endpoint (rate-limited)", async () => {
    (getSessionContext as Mock).mockResolvedValue(notImpersonating);

    const response = await POST(
      makeRequest({
        currentPassword: "old-pass",
        newPassword: "new-password-123",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(callAuthEndpoint).toHaveBeenCalledWith(
      expect.anything(),
      "/change-password",
      { currentPassword: "old-pass", newPassword: "new-password-123" }
    );
    expect(readAuthEndpointResponse).toHaveBeenCalledWith(fakeAuthResponse);
  });

  it("should propagate Better Auth errors (e.g. wrong current password)", async () => {
    (getSessionContext as Mock).mockResolvedValue(notImpersonating);
    (readAuthEndpointResponse as Mock).mockRejectedValue(
      new APIError(400, { message: "Invalid password" })
    );

    const response = await POST(
      makeRequest({
        currentPassword: "wrong-pass",
        newPassword: "new-password-123",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid password");
  });

  it("should return 500 on unexpected errors", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    (getSessionContext as Mock).mockResolvedValue(notImpersonating);
    (callAuthEndpoint as Mock).mockRejectedValue(new Error("boom"));

    const response = await POST(
      makeRequest({
        currentPassword: "old-pass",
        newPassword: "new-password-123",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");

    consoleErrorSpy.mockRestore();
  });
});
