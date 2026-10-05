import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { APIError } from "better-auth/api";
import { POST } from "../route";
// Mock Better Auth: `callAuthEndpoint`/`readAuthEndpointResponse` sono il
// confine con Better Auth (instradano attraverso il router HTTP invece di
// `auth.api.signInEmail` diretto, per beneficiare del suo rate-limit
// nativo su /sign-in/*, vedi src/lib/auth.ts).
vi.mock("@/lib/auth", () => ({
  callAuthEndpoint: vi.fn(),
  readAuthEndpointResponse: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/repositories/user.repository", () => ({
  findEmailByUsername: vi.fn(),
}));
// Import after mocks
import { callAuthEndpoint, readAuthEndpointResponse } from "@/lib/auth";
import { findEmailByUsername } from "@/lib/repositories/user.repository";

// Non ha bisogno di essere una vera Response: `callAuthEndpoint` è mockato,
// quindi il valore risolto passa solo a `readAuthEndpointResponse` (anche
// lui mockato). `headers.get` serve per l'eventuale forward del cookie di
// sessione.
function makeFakeAuthResponse(setCookie: string | null = null): Response {
  return { headers: { get: () => setCookie } } as unknown as Response;
}

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/login", () => {
  beforeEach(() => {
    (callAuthEndpoint as Mock)
      .mockReset()
      .mockResolvedValue(makeFakeAuthResponse());
    (readAuthEndpointResponse as Mock)
      .mockReset()
      .mockResolvedValue({ token: "session-token" });
    (findEmailByUsername as Mock).mockReset();
  });

  it("should return 400 when identifier or password is missing", async () => {
    const response = await POST(makeRequest({ password: "secret123" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid data");
    expect(callAuthEndpoint).not.toHaveBeenCalled();
  });

  it("should sign in directly when the identifier is already an email", async () => {
    const response = await POST(
      makeRequest({ identifier: "mario@example.com", password: "secret123" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.token).toBe("session-token");
    expect(findEmailByUsername).not.toHaveBeenCalled();
    expect(callAuthEndpoint).toHaveBeenCalledWith(
      expect.anything(),
      "/sign-in/email",
      {
        email: "mario@example.com",
        password: "secret123",
        rememberMe: undefined,
        callbackURL: "/dashboard",
      }
    );
  });

  it("should resolve a username to its email before signing in", async () => {
    (findEmailByUsername as Mock).mockResolvedValue("mario@example.com");

    const response = await POST(
      makeRequest({ identifier: "marietto", password: "secret123" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.token).toBe("session-token");
    expect(findEmailByUsername).toHaveBeenCalledWith({}, "marietto");
    expect(callAuthEndpoint).toHaveBeenCalledWith(
      expect.anything(),
      "/sign-in/email",
      {
        email: "mario@example.com",
        password: "secret123",
        rememberMe: undefined,
        callbackURL: "/dashboard",
      }
    );
  });

  it("should return a generic invalid-credentials error for an unknown username, without calling Better Auth", async () => {
    (findEmailByUsername as Mock).mockResolvedValue(null);

    const response = await POST(
      makeRequest({ identifier: "nobody", password: "secret123" })
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Invalid email or password");
    expect(callAuthEndpoint).not.toHaveBeenCalled();
  });

  it("should forward the session cookie set by Better Auth", async () => {
    (callAuthEndpoint as Mock).mockResolvedValue(
      makeFakeAuthResponse("better-auth.session_token=abc; Path=/; HttpOnly")
    );

    const response = await POST(
      makeRequest({ identifier: "mario@example.com", password: "secret123" })
    );

    expect(response.headers.get("set-cookie")).toBe(
      "better-auth.session_token=abc; Path=/; HttpOnly"
    );
  });

  it("should propagate Better Auth errors (e.g. wrong password)", async () => {
    (readAuthEndpointResponse as Mock).mockRejectedValue(
      new APIError(401, { message: "Invalid email or password" })
    );

    const response = await POST(
      makeRequest({ identifier: "mario@example.com", password: "wrong" })
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Invalid email or password");
  });

  it("should propagate the Better Auth error code as `details` (T-047, es. EMAIL_NOT_VERIFIED)", async () => {
    (readAuthEndpointResponse as Mock).mockRejectedValue(
      new APIError(403, {
        message: "Email not verified",
        code: "EMAIL_NOT_VERIFIED",
      })
    );

    const response = await POST(
      makeRequest({ identifier: "mario@example.com", password: "secret123" })
    );
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Email not verified");
    expect(data.details).toBe("EMAIL_NOT_VERIFIED");
  });

  it("should return 500 on unexpected errors", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    (callAuthEndpoint as Mock).mockRejectedValue(new Error("boom"));

    const response = await POST(
      makeRequest({ identifier: "mario@example.com", password: "secret123" })
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");

    consoleErrorSpy.mockRestore();
  });
});
