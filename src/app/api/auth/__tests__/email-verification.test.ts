// @vitest-environment node
//
// A differenza di reset-password.test.ts (token via `verification` table),
// il token di verifica email è un JWT firmato con `jose` (webapi build, vedi
// `better-auth/dist/crypto/jwt.mjs`): richiede `crypto.subtle` completo, non
// disponibile in jsdom (l'environment di default di questo progetto, vedi
// `vitest.config.ts`) — da cui l'override qui, solo per questo file.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashPassword } from "better-auth/crypto";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";

// T-047. Stesso approccio di reset-password.test.ts: lasciamo che Better
// Auth esegua davvero il suo router + `prismaAdapter` per `/sign-up/email`,
// `/sign-in/email` e `/send-verification-email`, con Prisma mockato al
// confine (`@/lib/db`). Obiettivo: provare i criteri di accettazione del
// task che parlano esplicitamente di "verificabile chiamando l'endpoint di
// sign-in" (niente sessione per utente non verificato) senza reimplementare
// a mano la logica di Better Auth.
vi.mock("@/lib/db", () => ({ prisma: prismaClient }));
vi.mock("@/lib/email/verificationEmail", () => ({
  sendVerificationEmail: vi.fn(),
}));
vi.mock("@/lib/email/resetPasswordEmail", () => ({
  sendResetPasswordEmail: vi.fn(),
}));

const request = (path: string, body: unknown) =>
  new Request(`http://localhost:3000/api/auth${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify(body),
  });

describe("Better Auth — verifica email in registrazione (T-047)", () => {
  beforeEach(() => {
    prismaMock.verification.findMany.mockResolvedValue([]);
  });

  describe("/sign-up/email", () => {
    it("crea l'utente non verificato, invia l'email di conferma e NON apre una sessione (niente cookie)", async () => {
      const { auth } = await import("@/lib/auth");
      const { sendVerificationEmail } =
        await import("@/lib/email/verificationEmail");
      prismaMock.user.findUnique.mockResolvedValueOnce(null); // username libero
      prismaMock.user.create.mockResolvedValueOnce({
        id: "user-1",
        email: "nuovo@example.com",
        name: "nuovoutente",
        emailVerified: false,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      prismaMock.account.create.mockResolvedValueOnce({} as never);

      const res = await auth.handler(
        request("/sign-up/email", {
          email: "nuovo@example.com",
          name: "nuovoutente",
          password: "Password1",
          callbackURL: "/dashboard",
        })
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.token).toBeNull();
      expect(res.headers.get("set-cookie")).toBeNull();

      expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
      const call = vi.mocked(sendVerificationEmail).mock.calls[0][0];
      expect(call.to).toBe("nuovo@example.com");
      expect(call.url).toMatch(
        /^http:\/\/localhost:3000\/api\/auth\/verify-email\?token=.+&callbackURL=%2Fdashboard$/
      );
    });
  });

  describe("/verify-email", () => {
    it("il click sul link imposta emailVerified: true e riporta l'utente in dashboard già loggato (autoSignInAfterVerification)", async () => {
      const { auth } = await import("@/lib/auth");
      const { sendVerificationEmail } =
        await import("@/lib/email/verificationEmail");
      // Riusa lo stesso percorso reale della registrazione per ottenere un
      // token JWT valido (firmato con lo stesso secret di `auth.ts`), invece
      // di ricostruirlo a mano.
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      prismaMock.user.create.mockResolvedValueOnce({
        id: "user-1",
        email: "nuovo@example.com",
        name: "nuovoutente",
        emailVerified: false,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      prismaMock.account.create.mockResolvedValueOnce({} as never);
      await auth.handler(
        request("/sign-up/email", {
          email: "nuovo@example.com",
          name: "nuovoutente",
          password: "Password1",
          callbackURL: "/dashboard",
        })
      );
      const verifyUrl = new URL(
        vi.mocked(sendVerificationEmail).mock.calls[0][0].url
      );

      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: "user-1",
        email: "nuovo@example.com",
        name: "nuovoutente",
        emailVerified: false,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      prismaMock.user.update.mockResolvedValueOnce({
        id: "user-1",
        email: "nuovo@example.com",
        name: "nuovoutente",
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      prismaMock.session.create.mockResolvedValueOnce({
        id: "s1",
        token: "session-token",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 3600_000),
        createdAt: new Date(),
        updatedAt: new Date(),
        ipAddress: null,
        userAgent: null,
      } as never);

      const res = await auth.handler(
        new Request(
          `http://localhost:3000/api/auth/verify-email?${verifyUrl.search.slice(1)}`
        )
      );

      // Better Auth reindirizza sempre su `callbackURL` a fine flusso (qui
      // "/dashboard", passato da `src/app/api/signup/route.ts`, vedi
      // `verify-email` in `better-auth/dist/api/routes/email-verification.mjs`).
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/dashboard");
      expect(res.headers.get("set-cookie")).toContain(
        "better-auth.session_token"
      );

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ emailVerified: true }),
        })
      );
    });
  });

  describe("/sign-in/email", () => {
    it("rifiuta il login con code EMAIL_NOT_VERIFIED, non apre alcuna sessione e invia un nuovo link (sendOnSignIn)", async () => {
      const { auth } = await import("@/lib/auth");
      const { sendVerificationEmail } =
        await import("@/lib/email/verificationEmail");
      // Il controllo `requireEmailVerification` scatta solo DOPO la verifica
      // della password (vedi sign-in.mjs): serve un hash reale, prodotto
      // dallo stesso hasher di Better Auth, perché la richiesta arrivi fino
      // al controllo che vogliamo testare.
      const passwordHash = await hashPassword("Password1");
      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: "user-1",
        email: "utente@example.com",
        name: "Utente",
        emailVerified: false,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      // Niente `experimental.joins` in `src/lib/auth.ts`: senza join nativo,
      // l'adapter esegue una query separata per il modello collegato
      // (`account`), come già in reset-password.test.ts per lo stesso motivo
      // (vedi `handleFallbackJoin` in
      // `@better-auth/core/dist/db/adapter/factory.mjs`).
      prismaMock.account.findMany.mockResolvedValueOnce([
        {
          id: "a1",
          userId: "user-1",
          providerId: "credential",
          accountId: "user-1",
          password: passwordHash,
        },
      ] as never);

      const res = await auth.handler(
        request("/sign-in/email", {
          email: "utente@example.com",
          password: "Password1",
          callbackURL: "/dashboard",
        })
      );
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.code).toBe("EMAIL_NOT_VERIFIED");
      expect(res.headers.get("set-cookie")).toBeNull();

      // `emailVerification.sendOnSignIn: true` (src/lib/auth.ts): un
      // tentativo di login bloccato rimanda da sé un nuovo link, copre "ho
      // perso la prima email" senza un endpoint di resend dedicato lato UI
      // in quel punto d'ingresso.
      expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
      expect(sendVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "utente@example.com" })
      );
    });
  });

  describe("/send-verification-email", () => {
    it("risponde sempre con successo generico, anche per un'email inesistente (niente enumerazione utenti)", async () => {
      const { auth } = await import("@/lib/auth");
      const { sendVerificationEmail } =
        await import("@/lib/email/verificationEmail");
      prismaMock.user.findFirst.mockResolvedValueOnce(null);

      const res = await auth.handler(
        request("/send-verification-email", {
          email: "non-esiste@example.com",
        })
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ status: true });
      expect(sendVerificationEmail).not.toHaveBeenCalled();
    });
  });
});
