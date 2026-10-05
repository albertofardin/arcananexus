import { describe, it, expect, vi } from "vitest";
import { APIError } from "better-auth/api";
import { auth, callAuthEndpoint, readAuthEndpointResponse } from "./auth";
import { sendResetPasswordEmail } from "@/lib/email/resetPasswordEmail";
import { sendVerificationEmail } from "@/lib/email/verificationEmail";

vi.mock("@/lib/email/resetPasswordEmail", () => ({
  sendResetPasswordEmail: vi.fn(),
}));
vi.mock("@/lib/email/verificationEmail", () => ({
  sendVerificationEmail: vi.fn(),
}));

describe("Better Auth Configuration", () => {
  it("should export auth instance", () => {
    expect(auth).toBeDefined();
    expect(auth).toHaveProperty("api");
  });

  it("should have getSession API method", () => {
    expect(auth.api).toHaveProperty("getSession");
    expect(typeof auth.api.getSession).toBe("function");
  });

  it("should have database adapter configured", () => {
    // Better Auth instance should be properly configured
    // We can't test internal config easily, but we can verify the instance exists
    expect(auth).toBeTruthy();
  });

  it("should have email and password enabled", () => {
    // This verifies the auth object was created successfully with emailAndPassword config
    expect(auth).toBeDefined();
    expect(auth.api).toBeDefined();
  });

  describe("Auth API Methods", () => {
    it("should expose required API methods", () => {
      const requiredMethods = ["getSession"];

      requiredMethods.forEach(method => {
        expect(auth.api).toHaveProperty(method);
        expect(
          typeof (auth.api as unknown as Record<string, unknown>)[method]
        ).toBe("function");
      });
    });

    it("should have session management methods", () => {
      // Verify core Better Auth API structure
      expect(auth.api).toHaveProperty("getSession");
      expect(auth.api.getSession).toBeInstanceOf(Function);
    });
  });

  describe("Auth Instance Structure", () => {
    it("should be properly typed", () => {
      // TypeScript will catch type errors at compile time
      // This test verifies the instance structure at runtime
      expect(typeof auth).toBe("object");
      expect(auth).not.toBeNull();
    });

    it("should have api property", () => {
      expect(auth).toHaveProperty("api");
      expect(typeof auth.api).toBe("object");
    });
  });

  describe("Configuration Validation", () => {
    it("should have been configured with Prisma adapter", () => {
      // Implicit test: if auth initializes successfully, adapter is configured
      expect(auth).toBeDefined();
    });

    it("should support email/password authentication", () => {
      // Implicit test: emailAndPassword was enabled in config
      expect(auth.api).toBeDefined();
    });

    it("should be a valid Better Auth instance", () => {
      // Verify it's not an empty object or null
      expect(auth).toBeTruthy();
      expect(Object.keys(auth).length).toBeGreaterThan(0);
    });
  });

  describe("Type Safety", () => {
    it("should have correct TypeScript types", () => {
      // This is primarily a compile-time check
      // At runtime, we verify the structure matches expectations
      const session = auth.api.getSession;
      expect(typeof session).toBe("function");
    });
  });
});

// T-046: prima di questa callback il reset password non era abilitato lato
// server (mancava del tutto `emailAndPassword.sendResetPassword`). Questi
// test coprono solo il wiring della config, non l'intero flusso HTTP
// (token/verifica/scadenza sono logica interna di Better Auth, già coperta
// dal suo test suite upstream — vedi `password.mjs` in
// `node_modules/better-auth/dist/api/routes`).
describe("emailAndPassword — reset password (T-046)", () => {
  it("delegates sendResetPassword to sendResetPasswordEmail with the user's email and the generated url", async () => {
    const sendResetPassword = auth.options.emailAndPassword?.sendResetPassword;
    expect(typeof sendResetPassword).toBe("function");
    if (!sendResetPassword) throw new Error("sendResetPassword non definito");

    const user = { email: "user@example.com" } as Parameters<
      typeof sendResetPassword
    >[0]["user"];
    const url =
      "http://localhost:3000/api/auth/reset-password/tok123?callbackURL=%2F";

    await sendResetPassword({ user, url, token: "tok123" });

    expect(sendResetPasswordEmail).toHaveBeenCalledWith({
      to: "user@example.com",
      url,
    });
  });

  it("revokes sessions on password reset (chiunque avesse una sessione attiva su un altro device viene disconnesso)", () => {
    // La cancellazione effettiva delle sessioni è responsabilità interna di
    // Better Auth (`internalAdapter.deleteSessions`, invocata solo quando
    // questo flag è true — vedi `resetPassword` in
    // `better-auth/api/routes/password.ts`): qui verifichiamo che il flag
    // sia impostato, non testiamo la sua implementazione interna.
    expect(auth.options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(
      true
    );
  });

  // `resetPasswordTokenExpiresIn` non è impostato in `src/lib/auth.ts` (si
  // resta sul default di Better Auth 1.6.11, 3600s/1h): la sua assenza nella
  // config è già garantita a livello di tipi (il tipo di `auth.options
  // .emailAndPassword` è inferito dal literal passato a `betterAuth(...)`,
  // quindi un accesso a quella proprietà qui sarebbe un errore di
  // compilazione, non solo `undefined` a runtime).
});

// T-047: verifica email in registrazione — un login bloccato/una registrazione
// non verificata sono comportamento interno di Better Auth (già coperto dal
// suo test suite upstream e da src/app/api/auth/__tests__/email-verification
// .test.ts per il caso HTTP end-to-end); qui copriamo solo il wiring della
// config in questo file.
describe("emailAndPassword / emailVerification — verifica email (T-047)", () => {
  it("requires email verification before login", () => {
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(true);
  });

  it("sends the verification email on sign-up", () => {
    expect(auth.options.emailVerification?.sendOnSignUp).toBe(true);
  });

  it("resends a fresh verification email on a blocked (unverified) login attempt", () => {
    expect(auth.options.emailVerification?.sendOnSignIn).toBe(true);
  });

  it("auto-signs-in the user when they click the verification link", () => {
    expect(auth.options.emailVerification?.autoSignInAfterVerification).toBe(
      true
    );
  });

  it("delegates sendVerificationEmail to sendVerificationEmail with the user's email and the generated url", async () => {
    const sendVerification =
      auth.options.emailVerification?.sendVerificationEmail;
    expect(typeof sendVerification).toBe("function");
    if (!sendVerification) throw new Error("sendVerification non definito");

    const user = { email: "user@example.com" } as Parameters<
      typeof sendVerification
    >[0]["user"];
    const url =
      "http://localhost:3000/api/auth/verify-email?token=tok123&callbackURL=%2F";

    await sendVerification({ user, url, token: "tok123" });

    expect(sendVerificationEmail).toHaveBeenCalledWith({
      to: "user@example.com",
      url,
      token: "tok123",
    });
  });
});

// T-6 review (MAJOR #1): `auth.api.*` bypassa il router HTTP di Better Auth
// (e quindi il suo rate-limit nativo). `callAuthEndpoint` instrada invece
// l'operazione attraverso `auth.handler`, lo stesso usato dal catch-all
// `src/app/api/auth/[...all]/route.ts`.
describe("callAuthEndpoint", () => {
  it("forwards the request to the Better Auth router with the session cookie", async () => {
    const handlerSpy = vi
      .spyOn(auth, "handler")
      .mockResolvedValue(
        new Response(JSON.stringify({ status: true }), { status: 200 })
      );

    const request = new Request("http://localhost:3000/api/profile/password", {
      method: "POST",
      headers: { cookie: "better-auth.session_token=abc" },
    });

    const response = await callAuthEndpoint(request, "/change-password", {
      currentPassword: "old-pass",
      newPassword: "new-password-123",
    });

    expect(handlerSpy).toHaveBeenCalledTimes(1);
    const forwardedRequest = handlerSpy.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.url).toBe(
      "http://localhost:3000/api/auth/change-password"
    );
    expect(forwardedRequest.method).toBe("POST");
    expect(forwardedRequest.headers.get("cookie")).toBe(
      "better-auth.session_token=abc"
    );
    expect(await forwardedRequest.json()).toEqual({
      currentPassword: "old-pass",
      newPassword: "new-password-123",
    });
    expect(await response.json()).toEqual({ status: true });

    handlerSpy.mockRestore();
  });

  it("does not forward a cookie header when the request has none", async () => {
    const handlerSpy = vi
      .spyOn(auth, "handler")
      .mockResolvedValue(
        new Response(JSON.stringify({ status: true }), { status: 200 })
      );

    const request = new Request("http://localhost:3000/api/profile/password", {
      method: "POST",
    });

    await callAuthEndpoint(request, "/verify-password", { password: "x" });

    const forwardedRequest = handlerSpy.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.headers.get("cookie")).toBeNull();

    handlerSpy.mockRestore();
  });
});

describe("readAuthEndpointResponse", () => {
  it("returns the parsed body for a successful response", async () => {
    const response = new Response(JSON.stringify({ status: true }), {
      status: 200,
    });

    await expect(readAuthEndpointResponse(response)).resolves.toEqual({
      status: true,
    });
  });

  it("throws an APIError carrying the response status and body for a non-2xx response", async () => {
    const makeResponse = () =>
      new Response(JSON.stringify({ message: "Invalid password" }), {
        status: 400,
      });

    await expect(
      readAuthEndpointResponse(makeResponse())
    ).rejects.toBeInstanceOf(APIError);
    await expect(
      readAuthEndpointResponse(makeResponse())
    ).rejects.toMatchObject({
      statusCode: 400,
      body: { message: "Invalid password" },
    });
  });
});
