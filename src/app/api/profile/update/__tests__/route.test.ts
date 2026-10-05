import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { APIError } from "better-auth/api";
import { PUT } from "../route";
// Mock Better Auth: `auth.api.updateUser` resta una chiamata diretta (nome
// e avatar non sono operazioni sensibili come email/password), mentre
// `callAuthEndpoint`/`readAuthEndpointResponse` sono il confine con le
// operazioni instradate attraverso il router HTTP di Better Auth
// (/verify-password, /change-email — review T-6, MAJOR #1).
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      updateUser: vi.fn(),
    },
  },
  callAuthEndpoint: vi.fn(),
  readAuthEndpointResponse: vi.fn(),
}));
// Mock impersonation: il cambio email deve essere rifiutato durante
// un'impersonificazione (review T-6, MAJOR #2).
vi.mock("@/lib/impersonation", () => ({
  getSessionContext: vi.fn(),
}));
// Mock prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    personalData: {
      upsert: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));
// Import after mocks
import { auth, callAuthEndpoint, readAuthEndpointResponse } from "@/lib/auth";
import { getSessionContext } from "@/lib/impersonation";
import { prisma } from "@/lib/db";

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

// Non deve essere una vera Response tranne quando un test ispeziona i suoi
// header (es. il forwarding del set-cookie): `readAuthEndpointResponse` è
// mockato separatamente, quindi qui basta un oggetto minimo con `.headers`.
const fakeAuthResponse = { headers: new Headers() } as unknown as Response;

const personalDataFixture = {
  firstName: "Mario",
  lastName: "Rossi",
  ssn: "RSSMRA80A01H501Z",
  address: "Via Roma 1, 20100 Milano",
  dateOfBirth: "1980-01-01",
  placeOfBirth: "Milano",
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/profile/update", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/profile/update", () => {
  beforeEach(() => {
    (getSessionContext as Mock).mockReset();
    (auth.api.updateUser as unknown as Mock)
      .mockReset()
      .mockResolvedValue({ status: true });
    (callAuthEndpoint as Mock).mockReset().mockResolvedValue(fakeAuthResponse);
    (readAuthEndpointResponse as Mock)
      .mockReset()
      .mockResolvedValue({ status: true });
    (prisma.personalData.upsert as Mock).mockReset();
    (prisma.user.findFirst as Mock).mockReset().mockResolvedValue(null);
    (prisma.user.update as Mock).mockReset();
  });

  describe("Authentication", () => {
    it("should return 401 when user is not authenticated", async () => {
      (getSessionContext as Mock).mockResolvedValue(null);

      const response = await PUT(makeRequest({ name: "New Name" }));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Not authenticated");
      expect(auth.api.updateUser).not.toHaveBeenCalled();
    });
  });

  describe("Impersonation", () => {
    it("should return 403 and not touch the email when impersonating", async () => {
      (getSessionContext as Mock).mockResolvedValue(impersonating);

      const response = await PUT(makeRequest({ email: "nuovo@example.com" }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe(
        "Operazione non consentita durante l'impersonificazione"
      );
      expect(callAuthEndpoint).not.toHaveBeenCalled();
    });

    it("should still allow non-sensitive fields (name/avatar) while impersonating", async () => {
      (getSessionContext as Mock).mockResolvedValue(impersonating);

      const response = await PUT(makeRequest({ name: "Nuovo Nome" }));

      expect(response.status).toBe(200);
      expect(auth.api.updateUser).toHaveBeenCalled();
    });
  });

  describe("Username uniqueness (name field)", () => {
    beforeEach(() => {
      (getSessionContext as Mock).mockResolvedValue(notImpersonating);
    });

    it("should return 409 and not write anything when the name is already taken", async () => {
      (prisma.user.findFirst as Mock).mockResolvedValue({ id: "other-user" });

      const response = await PUT(makeRequest({ name: "Nome Occupato" }));
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe("Nome utente già in uso");
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { name: "Nome Occupato", NOT: { id: activeUser.id } },
        select: { id: true },
      });
      expect(auth.api.updateUser).not.toHaveBeenCalled();
      expect(callAuthEndpoint).not.toHaveBeenCalled();
    });

    it("should not check uniqueness when the name is left unchanged", async () => {
      const response = await PUT(makeRequest({ name: activeUser.name }));

      expect(response.status).toBe(200);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("Validation", () => {
    beforeEach(() => {
      (getSessionContext as Mock).mockResolvedValue(notImpersonating);
    });

    it("should return 400 for an invalid email", async () => {
      const response = await PUT(makeRequest({ email: "not-an-email" }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid data");
    });

    it("should return 400 when only some personal data fields are sent", async () => {
      const response = await PUT(makeRequest({ firstName: "Mario" }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid data");
      expect(auth.api.updateUser).not.toHaveBeenCalled();
      expect(prisma.personalData.upsert).not.toHaveBeenCalled();
    });

    it('should accept empty-string personal data fields as "not provided" (full-form submits from the existing UI)', async () => {
      // La pagina profilo invia sempre l'intero form: un utente che non ha
      // ancora compilato l'anagrafica manda tutti questi campi come "".
      const response = await PUT(
        makeRequest({
          name: "Mario Rossi",
          email: activeUser.email,
          image: "",
          firstName: "",
          lastName: "",
          ssn: "",
          address: "",
          dateOfBirth: "",
          placeOfBirth: "",
        })
      );

      expect(response.status).toBe(200);
      expect(prisma.personalData.upsert).not.toHaveBeenCalled();
    });

    it('should treat an empty-string name/image as "not provided" instead of erasing them', async () => {
      // Review T-6, MINOR: `image: ""` non deve azzerare l'avatar quando
      // il campo semplicemente non è stato valorizzato dal form.
      const response = await PUT(makeRequest({ name: "", image: "" }));

      expect(response.status).toBe(200);
      expect(auth.api.updateUser).not.toHaveBeenCalled();
    });

    it("should clear the avatar only on an explicit `image: null`", async () => {
      const response = await PUT(makeRequest({ image: null }));

      expect(response.status).toBe(200);
      expect(auth.api.updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { name: undefined, image: null },
        })
      );
    });

    it("should strip unknown fields instead of failing", async () => {
      const response = await PUT(
        makeRequest({ name: "Mario Rossi", foo: "bar" })
      );

      expect(response.status).toBe(200);
      expect(auth.api.updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { name: "Mario Rossi", image: undefined },
        })
      );
    });
  });

  describe("Updating name/avatar via Better Auth", () => {
    beforeEach(() => {
      (getSessionContext as Mock).mockResolvedValue(notImpersonating);
    });

    it("should call auth.api.updateUser when name changes", async () => {
      const response = await PUT(makeRequest({ name: "Nuovo Nome" }));

      expect(response.status).toBe(200);
      expect(auth.api.updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { name: "Nuovo Nome", image: undefined },
        })
      );
    });

    it("should call auth.api.updateUser when the avatar changes", async () => {
      const response = await PUT(
        makeRequest({ image: "https://example.com/avatar.png" })
      );

      expect(response.status).toBe(200);
      expect(auth.api.updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { name: undefined, image: "https://example.com/avatar.png" },
        })
      );
    });

    it("should not call auth.api.updateUser when neither name nor image are sent", async () => {
      const response = await PUT(makeRequest({}));

      expect(response.status).toBe(200);
      expect(auth.api.updateUser).not.toHaveBeenCalled();
    });
  });

  describe("Updating email (via Better Auth's HTTP endpoint, rate-limited)", () => {
    beforeEach(() => {
      (getSessionContext as Mock).mockResolvedValue(notImpersonating);
    });

    it("should require the current password to change the email", async () => {
      const response = await PUT(makeRequest({ email: "nuovo@example.com" }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe(
        "La password attuale è obbligatoria per cambiare l'email"
      );
      expect(callAuthEndpoint).not.toHaveBeenCalled();
    });

    it("should verify the current password, then change the email, both via callAuthEndpoint", async () => {
      const response = await PUT(
        makeRequest({
          email: "nuovo@example.com",
          currentPassword: "current-pass",
        })
      );

      expect(response.status).toBe(200);
      expect(callAuthEndpoint).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        "/verify-password",
        { password: "current-pass" }
      );
      expect(callAuthEndpoint).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        "/change-email",
        {
          newEmail: "nuovo@example.com",
          callbackURL: "/dashboard/profile",
        }
      );
    });

    it("should not call callAuthEndpoint when the email is unchanged", async () => {
      const response = await PUT(makeRequest({ email: activeUser.email }));

      expect(response.status).toBe(200);
      expect(callAuthEndpoint).not.toHaveBeenCalled();
    });

    it("should reject the change and not write anything else when the current password is wrong", async () => {
      (readAuthEndpointResponse as Mock).mockRejectedValueOnce(
        new APIError(400, { message: "Invalid password" })
      );

      const response = await PUT(
        makeRequest({
          name: "Nuovo Nome",
          email: "nuovo@example.com",
          currentPassword: "wrong-pass",
          ...personalDataFixture,
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid password");
      // Verifica della password eseguita per prima: se fallisce, non deve
      // essere scritto nient'altro (review T-6, MINOR "update non atomico").
      expect(callAuthEndpoint).toHaveBeenCalledTimes(1);
      expect(auth.api.updateUser).not.toHaveBeenCalled();
      expect(prisma.personalData.upsert).not.toHaveBeenCalled();
    });

    it("should return success even when Better Auth silently no-ops an email already in use (anti-enumeration)", async () => {
      // Better Auth risponde comunque `{ status: true }` senza lanciare
      // quando `newEmail` appartiene già a un altro utente (anti
      // enumeration): non c'è un errore realistico da propagare qui.
      const response = await PUT(
        makeRequest({
          email: "already-taken@example.com",
          currentPassword: "current-pass",
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("should forward a Set-Cookie header returned by the change-email endpoint", async () => {
      (callAuthEndpoint as Mock).mockImplementation(
        (_req: unknown, path: string) => {
          if (path === "/change-email") {
            return Promise.resolve({
              headers: new Headers({
                "set-cookie": "better-auth.session_token=new",
              }),
            } as unknown as Response);
          }
          return Promise.resolve(fakeAuthResponse);
        }
      );

      const response = await PUT(
        makeRequest({
          email: "nuovo@example.com",
          currentPassword: "current-pass",
        })
      );

      expect(response.headers.get("set-cookie")).toBe(
        "better-auth.session_token=new"
      );
    });
  });

  describe("Updating personal data", () => {
    beforeEach(() => {
      (getSessionContext as Mock).mockResolvedValue(notImpersonating);
    });

    it("should upsert personal data scoped to the session userId", async () => {
      const response = await PUT(makeRequest(personalDataFixture));

      expect(response.status).toBe(200);
      expect(prisma.personalData.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
          create: expect.objectContaining({
            userId: "user-1",
            firstName: "Mario",
          }),
        })
      );
    });

    it("should ignore an attacker-supplied userId and always use the session's own id", async () => {
      const response = await PUT(
        makeRequest({ ...personalDataFixture, userId: "user-2" })
      );

      expect(response.status).toBe(200);
      expect(prisma.personalData.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-1" } })
      );
      expect(prisma.personalData.upsert).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-2" } })
      );
    });

    it("should never write an `email` field onto PersonalData (User.email is the single source of truth)", async () => {
      // Review T-6, MAJOR #3: la copia dell'email su PersonalData poteva
      // divergere da User.email; è stata rimossa dallo schema e non deve
      // più comparire nel payload dell'upsert, nemmeno quando la richiesta
      // include anche un cambio email.
      const response = await PUT(
        makeRequest({
          email: "nuovo@example.com",
          currentPassword: "current-pass",
          ...personalDataFixture,
        })
      );

      expect(response.status).toBe(200);
      const call = (prisma.personalData.upsert as Mock).mock.calls[0][0];
      expect(call.create).not.toHaveProperty("email");
      expect(call.update).not.toHaveProperty("email");
    });

    it("should include contact and guardian fields in the upsert when present (nullable columns, not subject to the all-or-nothing core group)", async () => {
      const response = await PUT(
        makeRequest({
          ...personalDataFixture,
          phone: "+39 333 1234567",
          nationality: "Italiana",
        })
      );

      expect(response.status).toBe(200);
      expect(prisma.personalData.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            phone: "+39 333 1234567",
            nationality: "Italiana",
          }),
        })
      );
    });

    it("should reject the update when the person is a minor and guardian data is missing", async () => {
      const today = new Date();
      const minorDateOfBirth = new Date(
        today.getFullYear() - 16,
        today.getMonth(),
        today.getDate()
      )
        .toISOString()
        .split("T")[0];

      const response = await PUT(
        makeRequest({
          ...personalDataFixture,
          dateOfBirth: minorDateOfBirth,
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid data");
      expect(prisma.personalData.upsert).not.toHaveBeenCalled();
    });

    it("should accept the update for a minor when guardian name and phone are provided", async () => {
      const today = new Date();
      const minorDateOfBirth = new Date(
        today.getFullYear() - 16,
        today.getMonth(),
        today.getDate()
      )
        .toISOString()
        .split("T")[0];

      const response = await PUT(
        makeRequest({
          ...personalDataFixture,
          dateOfBirth: minorDateOfBirth,
          guardianName: "Giuseppe Rossi",
          guardianPhone: "+39 333 7654321",
        })
      );

      expect(response.status).toBe(200);
      expect(prisma.personalData.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            guardianName: "Giuseppe Rossi",
            guardianPhone: "+39 333 7654321",
          }),
        })
      );
    });
  });

  describe("Updating the email notifications preference", () => {
    beforeEach(() => {
      (getSessionContext as Mock).mockResolvedValue(notImpersonating);
    });

    it("should update the preference scoped to the session userId", async () => {
      const response = await PUT(
        makeRequest({ emailNotificationsEnabled: false })
      );

      expect(response.status).toBe(200);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { emailNotificationsEnabled: false },
      });
    });

    it("should not touch the preference when not sent", async () => {
      const response = await PUT(makeRequest({ name: "Nuovo Nome" }));

      expect(response.status).toBe(200);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      (getSessionContext as Mock).mockResolvedValue(notImpersonating);
    });

    it("should return 500 on unexpected errors", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      (auth.api.updateUser as unknown as Mock).mockRejectedValue(
        new Error("boom")
      );

      const response = await PUT(makeRequest({ name: "Nuovo Nome" }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Internal server error");

      consoleErrorSpy.mockRestore();
    });
  });
});
