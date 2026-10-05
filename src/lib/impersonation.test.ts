/**
 * @vitest-environment node
 *
 * Test di integrazione a basso livello per `getSessionContext` (T-010, bug
 * P0). A differenza dei test delle route/dei componenti (che mockano
 * `auth.api.*` con oggetti finti), qui viene costruita una VERA istanza
 * Better Auth con lo stesso plugin `admin` usato in produzione, appoggiata a
 * `@better-auth/memory-adapter` (adapter in-memory, senza Postgres — è una
 * dipendenza transitiva di `better-auth` stesso, non richiede
 * un'installazione separata). Cookie di sessione e cookie admin sono quindi
 * firmati e verificati per davvero dal core di Better Auth.
 *
 * Questo copre esattamente il gap che ha nascosto il bug P0: la
 * reimplementazione custom precedente scriveva cookie di sessione non
 * firmati, che i test con MSW/mock a stringa non potevano rilevare perché
 * non passano mai dalla firma/verifica reale. Un futuro regressione sulla
 * firma dei cookie (secret sbagliato, formato cambiato, nome cookie
 * disallineato...) farebbe fallire qui, non solo in QA manuale su DB reale.
 */
import { describe, it, expect, beforeAll, vi, type Mock } from "vitest";
// `vi.mock` è hoisted sopra gli import: questi risolvono sempre alle
// implementazioni mockate definite più sotto.
import { auth as testAuth } from "@/lib/auth";
import { getSessionContext } from "@/lib/impersonation";
import { prisma } from "@/lib/db";

const ADMIN_ID = "test-admin-id";
const TARGET_ID = "test-target-id";
const ADMIN_USER = { id: ADMIN_ID, name: "Admin", email: "admin@test.local" };
const TARGET_USER = {
  id: TARGET_ID,
  name: "Target",
  email: "target@test.local",
};
const PASSWORD = "password123456";

// `vi.mock` è hoisted sopra gli import: il factory deve essere autonomo
// (nessun riferimento a costanti dichiarate più sotto nel modulo, altrimenti
// si incapperebbe in una TDZ — il factory viene eseguito PRIMA che il resto
// del file finisca di valutarsi). Per questo gli id/le credenziali sono
// ripetuti come letterali qui dentro invece di referenziare le costanti
// sopra. `betterAuth()` è sincrono ma gli import dei pacchetti li facciamo
// dentro il factory (che può essere async) per semplicità e isolamento.
vi.mock("@/lib/auth", async () => {
  const { betterAuth } = await import("better-auth");
  const { admin } = await import("better-auth/plugins");
  const { memoryAdapter } = await import("@better-auth/memory-adapter");

  // Consumati in ordine dalla prima creazione utente in poi (vedi
  // `beforeAll` sotto: admin firmato per primo, poi il target) — solo per il
  // model "user", così l'id è prevedibile e può alimentare `adminUserIds`
  // pur essendo generato "prima" che l'istanza esista (altrimenti sarebbe
  // un problema circolare: il plugin richiede l'id in configurazione).
  const idQueue = ["test-admin-id", "test-target-id"];

  const testAuth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "impersonation-test-secret-at-least-32-characters-long",
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
    emailAndPassword: { enabled: true },
    advanced: {
      database: {
        generateId: ({ model }: { model: string }) =>
          model === "user"
            ? (idQueue.shift() ?? crypto.randomUUID())
            : crypto.randomUUID(),
      },
    },
    plugins: [admin({ adminUserIds: ["test-admin-id"] })],
  });

  return { auth: testAuth };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      // `getSessionContext` risolve l'admin dietro un'impersonation con una
      // query separata sul DB applicativo (non sull'adapter di Better Auth,
      // che qui è in-memory e isolato): la mocchiamo con gli stessi due
      // utenti creati sopra.
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === ADMIN_ID) return ADMIN_USER;
        if (where.id === TARGET_ID) return TARGET_USER;
        return null;
      }),
    },
  },
}));

// Applica su un header `cookie` esistente i `Set-Cookie` di una risposta
// Better Auth, replicando cosa farebbe un browser reale fra una richiesta e
// la successiva (stesso schema usato dalle route reali: propagare i
// `Set-Cookie` di `auth.api.*` sulla `NextResponse`).
function mergeCookies(existing: Headers, setCookieHeaders: string[]): Headers {
  const jar = new Map<string, string>();
  for (const pair of (existing.get("cookie") ?? "").split(";")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf("=");
    jar.set(
      trimmed.slice(0, separatorIndex),
      trimmed.slice(separatorIndex + 1)
    );
  }
  for (const setCookie of setCookieHeaders) {
    const firstPair = setCookie.split(";")[0]?.trim();
    if (!firstPair) continue;
    const separatorIndex = firstPair.indexOf("=");
    if (separatorIndex === -1) continue;
    jar.set(
      firstPair.slice(0, separatorIndex),
      firstPair.slice(separatorIndex + 1)
    );
  }
  return new Headers({
    cookie: [...jar.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; "),
  });
}

beforeAll(async () => {
  // Admin firmato per primo: consuma `test-admin-id` dalla idQueue del mock
  // sopra, coerente con `adminUserIds: ["test-admin-id"]`.
  await testAuth.api.signUpEmail({
    body: {
      email: ADMIN_USER.email,
      password: PASSWORD,
      name: ADMIN_USER.name,
    },
  });
  await testAuth.api.signUpEmail({
    body: {
      email: TARGET_USER.email,
      password: PASSWORD,
      name: TARGET_USER.name,
    },
  });
});

describe("getSessionContext — con cookie realmente firmati da Better Auth (plugin admin)", () => {
  it("sessione normale (nessuna impersonation): isImpersonating è false", async () => {
    const { headers: signInHeaders } = await testAuth.api.signInEmail({
      body: { email: ADMIN_USER.email, password: PASSWORD },
      returnHeaders: true,
    });
    const headers = mergeCookies(new Headers(), signInHeaders.getSetCookie());

    await expect(getSessionContext(headers)).resolves.toEqual({
      isImpersonating: false,
      activeUser: ADMIN_USER,
    });
  });

  it("ciclo completo start→status→end di un'impersonation reale: i cookie firmati dal plugin admin vengono letti correttamente", async () => {
    const { headers: signInHeaders } = await testAuth.api.signInEmail({
      body: { email: ADMIN_USER.email, password: PASSWORD },
      returnHeaders: true,
    });
    let headers = mergeCookies(new Headers(), signInHeaders.getSetCookie());

    // Stesso meccanismo delle route reali: `auth.api.impersonateUser` con
    // `returnHeaders: true`, propagando i Set-Cookie (vedi
    // src/app/api/admin/impersonate/start/route.ts).
    const { headers: impersonateHeaders } = await testAuth.api.impersonateUser({
      headers,
      body: { userId: TARGET_ID },
      returnHeaders: true,
    });
    headers = mergeCookies(headers, impersonateHeaders.getSetCookie());

    await expect(getSessionContext(headers)).resolves.toEqual({
      isImpersonating: true,
      activeUser: TARGET_USER,
      adminUser: ADMIN_USER,
    });

    // Stesso meccanismo di src/app/api/admin/impersonate/end/route.ts.
    const { headers: stopHeaders } = await testAuth.api.stopImpersonating({
      headers,
      returnHeaders: true,
    });
    headers = mergeCookies(headers, stopHeaders.getSetCookie());

    await expect(getSessionContext(headers)).resolves.toEqual({
      isImpersonating: false,
      activeUser: ADMIN_USER,
    });
  });

  it("nessuna sessione: ritorna null", async () => {
    await expect(getSessionContext(new Headers())).resolves.toBeNull();
  });

  it("interroga il DB applicativo (prisma.user) per risolvere l'admin dietro l'impersonation", async () => {
    const { headers: signInHeaders } = await testAuth.api.signInEmail({
      body: { email: ADMIN_USER.email, password: PASSWORD },
      returnHeaders: true,
    });
    let headers = mergeCookies(new Headers(), signInHeaders.getSetCookie());
    const { headers: impersonateHeaders } = await testAuth.api.impersonateUser({
      headers,
      body: { userId: TARGET_ID },
      returnHeaders: true,
    });
    headers = mergeCookies(headers, impersonateHeaders.getSetCookie());

    await getSessionContext(headers);

    expect(prisma.user.findUnique as Mock).toHaveBeenCalledWith({
      where: { id: ADMIN_ID },
      select: { id: true, name: true, email: true },
    });
  });
});
