import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { APIError } from "better-auth/api";
import { POST } from "../route";
// Mock Better Auth: `callAuthEndpoint`/`readAuthEndpointResponse` sono il
// confine con Better Auth (instradano attraverso il router HTTP invece di
// `auth.api.signUpEmail` diretto, per beneficiare del suo rate-limit nativo
// su /sign-up/*, vedi src/lib/auth.ts) — stesso mock di /api/login.
vi.mock("@/lib/auth", () => ({
  callAuthEndpoint: vi.fn(),
  readAuthEndpointResponse: vi.fn(),
}));
// Import after mocks
import { callAuthEndpoint, readAuthEndpointResponse } from "@/lib/auth";

// Non ha bisogno di essere una vera Response: `callAuthEndpoint` è mockato,
// quindi il valore risolto passa solo a `readAuthEndpointResponse` (anche
// lui mockato). `headers.get` serve per l'eventuale forward del cookie di
// sessione.
function makeFakeAuthResponse(setCookie: string | null = null): Response {
  return { headers: { get: () => setCookie } } as unknown as Response;
}

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/signup", () => {
  beforeEach(() => {
    (callAuthEndpoint as Mock)
      .mockReset()
      .mockResolvedValue(makeFakeAuthResponse());
    (readAuthEndpointResponse as Mock)
      .mockReset()
      .mockResolvedValue({ token: "session-token" });
  });

  it("should return 400 when email, name or password is missing", async () => {
    const response = await POST(makeRequest({ email: "mario@example.com" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid data");
    expect(callAuthEndpoint).not.toHaveBeenCalled();
  });

  it("should return 400 when email is not a valid address", async () => {
    const response = await POST(
      makeRequest({
        email: "not-an-email",
        name: "marietto",
        password: "secret123",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid data");
    expect(callAuthEndpoint).not.toHaveBeenCalled();
  });

  it("should sign up and forward email/name/password to Better Auth", async () => {
    const response = await POST(
      makeRequest({
        email: "mario@example.com",
        name: "marietto",
        password: "secret123",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.token).toBe("session-token");
    expect(callAuthEndpoint).toHaveBeenCalledWith(
      expect.anything(),
      "/sign-up/email",
      {
        email: "mario@example.com",
        password: "secret123",
        name: "marietto",
        callbackURL: "/dashboard",
      }
    );
  });

  it("should forward the session cookie set by Better Auth", async () => {
    (callAuthEndpoint as Mock).mockResolvedValue(
      makeFakeAuthResponse("better-auth.session_token=abc; Path=/; HttpOnly")
    );

    const response = await POST(
      makeRequest({
        email: "mario@example.com",
        name: "marietto",
        password: "secret123",
      })
    );

    expect(response.headers.get("set-cookie")).toBe(
      "better-auth.session_token=abc; Path=/; HttpOnly"
    );
  });

  it("should propagate Better Auth errors as-is (e.g. duplicate username)", async () => {
    (readAuthEndpointResponse as Mock).mockRejectedValue(
      new APIError("BAD_REQUEST", { message: "Nome utente già in uso" })
    );

    const response = await POST(
      makeRequest({
        email: "mario@example.com",
        name: "marietto",
        password: "secret123",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Nome utente già in uso");
  });

  it("should return 500 on unexpected errors", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    (callAuthEndpoint as Mock).mockRejectedValue(new Error("boom"));

    const response = await POST(
      makeRequest({
        email: "mario@example.com",
        name: "marietto",
        password: "secret123",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");

    consoleErrorSpy.mockRestore();
  });
});
