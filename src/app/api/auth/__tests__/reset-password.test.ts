import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";

// T-046. A differenza degli altri test su `src/lib/auth.ts` (che mockano
// `auth.handler` per intero, vedi `auth.test.ts`), qui lasciamo che Better
// Auth esegua davvero il suo router + `prismaAdapter` per `/request-password-
// reset` e `/reset-password`, con Prisma mockato al confine (`@/lib/db`).
// Obiettivo: provare i criteri di accettazione del task che parlano
// esplicitamente di "verificabile a livello di test API" (niente
// enumerazione utenti, email effettivamente inviata con token, token
// invalido/scaduto, revoca sessioni) senza reimplementare a mano la logica
// di Better Auth — la eserciteremo con la sua config reale
// (`src/lib/auth.ts`).
vi.mock("@/lib/db", () => ({ prisma: prismaClient }));
vi.mock("@/lib/email/resetPasswordEmail", () => ({
  sendResetPasswordEmail: vi.fn(),
}));

const request = (path: string, body: unknown) =>
  new Request(`http://localhost:3000/api/auth${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Il router di Better Auth valida l'origin per le richieste POST con
      // cookie assente solo se arriva un header origin/referer "non vuoto";
      // qui non c'è un cookie di sessione, ma lo passiamo comunque per
      // restare vicini a una richiesta browser reale.
      origin: "http://localhost:3000",
    },
    body: JSON.stringify(body),
  });

describe("Better Auth — /request-password-reset e /reset-password (T-046)", () => {
  beforeEach(() => {
    // `findVerificationValue` (usato sia per la simulazione anti-timing-
    // attack sull'email inesistente, sia per la pulizia dei token scaduti)
    // passa sempre da `verification.findMany`: senza un default il mock
    // deep-mockato risolverebbe a `undefined` e Better Auth andrebbe in
    // errore (`Cannot read properties of undefined (reading 'map')`).
    prismaMock.verification.findMany.mockResolvedValue([]);
  });

  describe("/request-password-reset", () => {
    it("risponde sempre con successo generico, anche per un'email inesistente (niente enumerazione utenti)", async () => {
      const { auth } = await import("@/lib/auth");
      const { sendResetPasswordEmail } =
        await import("@/lib/email/resetPasswordEmail");
      prismaMock.user.findFirst.mockResolvedValueOnce(null);

      const res = await auth.handler(
        request("/request-password-reset", {
          email: "non-esiste@example.com",
          redirectTo: "/?resetPassword=1",
        })
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        status: true,
        message:
          "If this email exists in our system, check your email for the reset link",
      });
      expect(sendResetPasswordEmail).not.toHaveBeenCalled();
    });

    it("per un'email esistente invia davvero l'email con un link contenente un token, con la stessa risposta generica", async () => {
      const { auth } = await import("@/lib/auth");
      const { sendResetPasswordEmail } =
        await import("@/lib/email/resetPasswordEmail");
      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: "user-1",
        email: "utente@example.com",
        name: "Utente",
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        accounts: [],
      } as never);
      prismaMock.verification.create.mockResolvedValueOnce({} as never);

      const res = await auth.handler(
        request("/request-password-reset", {
          email: "utente@example.com",
          redirectTo: "/?resetPassword=1",
        })
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        status: true,
        message:
          "If this email exists in our system, check your email for the reset link",
      });
      expect(sendResetPasswordEmail).toHaveBeenCalledTimes(1);
      const call = vi.mocked(sendResetPasswordEmail).mock.calls[0][0];
      expect(call.to).toBe("utente@example.com");
      // Il link riporta su `/` con `?resetPassword=1` (mai un path dedicato
      // che il middleware bloccherebbe per un utente sloggato, vedi
      // `middleware.test.ts`); il token è generato da Better Auth, non da
      // noi — verifichiamo solo che sia presente nel path.
      expect(call.url).toMatch(
        /^http:\/\/localhost:3000\/api\/auth\/reset-password\/[^/?]+\?callbackURL=%2F%3FresetPassword%3D1$/
      );
    });
  });

  describe("/reset-password", () => {
    it("rifiuta un token inesistente/scaduto con code INVALID_TOKEN (quello che il FE mappa in italiano, vedi LoginAccess.tsx)", async () => {
      const { auth } = await import("@/lib/auth");

      const res = await auth.handler(
        request("/reset-password", {
          newPassword: "Password1",
          token: "token-scaduto",
        })
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body).toEqual({ message: "Invalid token", code: "INVALID_TOKEN" });
    });

    it("con un token valido aggiorna la password e revoca le sessioni esistenti (revokeSessionsOnPasswordReset: true)", async () => {
      const { auth } = await import("@/lib/auth");
      const future = new Date(Date.now() + 3600_000);
      prismaMock.verification.findMany.mockResolvedValueOnce([
        {
          id: "v1",
          identifier: "reset-password:tok-abc",
          value: "user-1",
          expiresAt: future,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as never);
      // Consumo atomico del token (Better Auth 1.7, dopo `bun update`):
      // `consumeVerificationValue` prima individua la riga più recente via
      // `findMany` (sopra), poi la elimina per `id` (`verification.delete`)
      // e infine ripulisce eventuali altre righe con lo stesso identifier
      // (`verification.deleteMany`). A differenza di prima, il valore
      // risolto da `delete` non è più scartato: diventa direttamente la riga
      // "consumata" da cui l'handler legge `verification.value` (lo userId),
      // quindi deve rispecchiare la riga reale, non un oggetto vuoto.
      prismaMock.verification.delete.mockResolvedValueOnce({
        id: "v1",
        identifier: "reset-password:tok-abc",
        value: "user-1",
        expiresAt: future,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      prismaMock.verification.deleteMany.mockResolvedValueOnce({
        count: 1,
      } as never);
      // Dopo il consumo del token, l'handler carica l'utente
      // (`findUserById`, → `findOne` → Prisma `findFirst`) per rifiutare con
      // `USER_NOT_FOUND` un token orfano (utente cancellato nel frattempo).
      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: "user-1",
        email: "utente@example.com",
        name: "Utente",
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      // `findCredentialAccount` passa ora da `findOne` (→ Prisma
      // `findFirst`), non più da `findMany`.
      prismaMock.account.findFirst.mockResolvedValueOnce({
        id: "a1",
        userId: "user-1",
        providerId: "credential",
        accountId: "user-1",
      } as never);
      prismaMock.account.updateMany.mockResolvedValueOnce({
        count: 1,
      } as never);
      prismaMock.session.deleteMany.mockResolvedValueOnce({
        count: 2,
      } as never);

      const res = await auth.handler(
        request("/reset-password", {
          newPassword: "Password1",
          token: "tok-abc",
        })
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ status: true });

      // La password aggiornata sull'account `credential` dell'utente: non
      // asseriamo l'hash esatto (bcrypt/scrypt è non deterministico), solo
      // che sia stato scritto un valore diverso dalla password in chiaro,
      // per l'account/utente giusto.
      expect(prismaMock.account.updateMany).toHaveBeenCalledTimes(1);
      const updateArgs = prismaMock.account.updateMany.mock.calls[0][0] as {
        where: unknown;
        data: { password: string };
      };
      // Da Better Auth 1.7 (bun update) il where di `updatePassword` include
      // anche `accountId` (oltre a `userId`/`providerId`), per restringere
      // l'update all'account credential esatto dell'utente.
      expect(updateArgs.where).toEqual({
        AND: [
          { userId: { equals: "user-1" } },
          { providerId: { equals: "credential" } },
          { accountId: { equals: "user-1" } },
        ],
      });
      expect(updateArgs.data.password).not.toBe("Password1");

      // Sessioni revocate per lo stesso utente — criterio "un reset password
      // invalida le sessioni attive su altri device".
      expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: { equals: "user-1" } },
      });
    });
  });
});
