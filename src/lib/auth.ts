import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db";
import { sendResetPasswordEmail } from "@/lib/email/resetPasswordEmail";
import { sendVerificationEmail } from "@/lib/email/verificationEmail";
import { getAppBaseUrl } from "@/lib/appUrl";

const resolvedBaseUrl = getAppBaseUrl();

// Su Netlify `DEPLOY_PRIME_URL`/`DEPLOY_URL`/`URL` sono garantite solo a
// build time: a runtime (dentro la function che serve le richieste) non
// sono valorizzate, quindi una lista statica basata solo su quelle finiva
// per contenere solo il fallback `http://localhost:3000` — ogni dominio
// reale (produzione, staging, deploy preview) veniva respinto con "Invalid
// origin", bloccando login e registrazione (bug osservato su staging/prod).
//
// Elenco esplicito del dominio Netlify del progetto (produzione + pattern
// wildcard per i branch/deploy-preview, che seguono lo schema
// `<branch-o-deploy>--<sito>.netlify.app`): verificato con
// `matchesOriginPattern` di Better Auth, matcha staging/preview e NON domini
// estranei o look-alike.
// Va aggiornato a mano se in futuro si aggiunge un dominio custom (es.
// `arcanadomine.it`).
const NETLIFY_TRUSTED_ORIGINS = [
  "https://arcanadomine.netlify.app",
  "https://*--arcanadomine.netlify.app",
];

// Fallback dinamico: fida dell'origine della richiesta stessa (l'header
// `Origin` non è falsificabile lato browser, quindi equivale a "same-origin"
// per il caso reale di CSRF che questo controllo previene). Copre lo
// sviluppo locale su porte/host diversi da `localhost:3000` e qualunque
// altro ambiente non ancora elencato sopra, senza doverlo configurare a
// mano — la lista statica resta comunque la prima linea di difesa perché
// non dipende dalla correttezza dell'header Host in arrivo.
const trustedOrigins = (request?: Request) => [
  ...NETLIFY_TRUSTED_ORIGINS,
  ...(request ? [new URL(request.url).origin] : []),
];

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    // T-046: prima di questa callback il reset password non era nemmeno
    // abilitato lato server (Better Auth lancia "Reset password isn't
    // enabled" se manca). `url` arriva già pronto da Better Auth
    // (`{baseURL}/api/auth/reset-password/{token}?callbackURL=...`, vedi
    // `request-password-reset` in `better-auth/api/routes/password`); qui ci
    // limitiamo a spedirlo via email.
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail({ to: user.email, url });
    },
    // Un reset password è un evento sensibile (chiunque avesse una sessione
    // attiva su un altro device potrebbe non essere più il legittimo
    // proprietario dell'account): invalidiamo tutte le sessioni esistenti,
    // non solo quella corrente.
    revokeSessionsOnPasswordReset: true,
    // `resetPasswordTokenExpiresIn` non impostato esplicitamente: lasciato al
    // default di Better Auth 1.6.11 (3600s / 1 ora, vedi
    // `better-auth/api/routes/password.ts`). Rivalutare solo se emergono
    // requisiti di sicurezza più stringenti.
    // T-047: un utente non verificato non può accedere. Con questo flag
    // `/sign-in/email` (instradata da `/api/login`) rifiuta il login con
    // `APIError.from("FORBIDDEN", EMAIL_NOT_VERIFIED)` finché
    // `user.emailVerified` non è `true` (vedi `sign-in.mjs` in
    // `better-auth/dist/api/routes`) — niente sessione, niente cookie.
    requireEmailVerification: true,
  },
  // T-047: verifica email in registrazione. Con `requireEmailVerification`
  // sopra, `/sign-up/email` imposta da sé `shouldSkipAutoSignIn` (vedi
  // `sign-up.mjs`): la risposta di `/api/signup` ha già `token: null`,
  // nessun cookie di sessione — non serve altro qui per bloccare l'accesso
  // pre-verifica.
  emailVerification: {
    // Invia l'email subito dopo la registrazione.
    sendOnSignUp: true,
    // Un tentativo di login con email non verificata rimanda anche un nuovo
    // link (stesso callback sotto), oltre a rifiutare il login: copre il caso
    // "ho perso la prima email" senza un endpoint di resend dedicato lato UI
    // per quel punto d'ingresso (il resend esplicito da UI resta comunque
    // disponibile dalla schermata post-registrazione, via
    // `authClient.sendVerificationEmail`).
    // ponytail: nessun throttling oltre al rate-limit nativo già presente su
    // /sign-in/email (3 richieste/10s per IP, vedi sopra) — se osservato
    // abuso, valutare un rate-limit dedicato su questo invio.
    sendOnSignIn: true,
    // Il click sul link crea direttamente una sessione: l'utente non deve
    // rifare login dopo aver verificato (vedi `verify-email` in
    // `better-auth/dist/api/routes/email-verification.mjs`).
    autoSignInAfterVerification: true,
    // Questa stessa callback viene invocata anche da `/change-email` sotto
    // (Better Auth non ha una callback separata per quel flusso): `token`
    // viene passato così a valle per distinguere i due casi (vedi
    // `isChangeEmailToken` in `src/lib/email/verificationEmail.ts`).
    sendVerificationEmail: async ({ user, url, token }) => {
      await sendVerificationEmail({ to: user.email, url, token });
    },
    // `expiresIn` non impostato esplicitamente: default di Better Auth
    // 1.6.11 (3600s / 1 ora, stesso ordine di grandezza del reset password).
  },
  user: {
    changeEmail: {
      enabled: true,
      // Questo flag fa aggiornare l'email subito, senza verifica, ma
      // Better Auth lo applica solo se la sessione corrente ha
      // `emailVerified !== true` (vedi `changeEmail` in
      // `better-auth/dist/api/routes/update-user.mjs`). Con
      // `requireEmailVerification: true` sopra, nessun utente autenticato
      // può avere l'email corrente non verificata, quindi in pratica questo
      // ramo non scatta mai: ogni cambio email reale passa dal ramo
      // "invia verifica alla nuova email" (usa `sendVerificationEmail`
      // sopra), e il cambio in DB avviene solo al click sul link (T-6).
      // Resta `true` solo per non lasciare il flusso senza uscita nel caso
      // limite di un'email corrente non verificata.
      updateEmailWithoutVerification: true,
    },
  },
  databaseHooks: {
    user: {
      create: {
        // "name" fa anche da username di login (FormRegistration lo
        // etichetta "Nome Utente" ed è quel valore che /api/login risolve in
        // email, vedi src/app/api/login/route.ts) ed è vincolato a livello
        // di schema con `@@unique([name])`. Controllarlo qui, prima
        // dell'insert, evita che il duplicato arrivi al vincolo DB, che
        // risponderebbe con un errore Prisma generico e farebbe fallire la
        // registrazione con un messaggio poco chiaro per l'utente.
        before: async user => {
          const existing = await prisma.user.findUnique({
            where: { name: user.name },
            select: { id: true },
          });
          if (existing) {
            throw new APIError("BAD_REQUEST", {
              message: "Nome utente già in uso",
            });
          }
        },
      },
    },
  },
  // Abilitato esplicitamente (invece di affidarsi al default legato a
  // NODE_ENV): /change-password, /change-email e /sign-in hanno già un
  // rate-limit nativo stretto (3 richieste/10s per IP), a patto di passare
  // dal router HTTP — vedi `callAuthEndpoint` sotto (review T-6, MAJOR #1).
  // /verify-password (usato per confermare la password attuale prima di un
  // cambio email) non rientra nelle regole speciali di default: gli
  // applichiamo lo stesso limite.
  rateLimit: {
    enabled: true,
    customRules: {
      "/verify-password": { window: 10, max: 3 },
    },
  },
  baseURL: resolvedBaseUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins,
  plugins: [
    // Sostituisce l'impersonation custom (T-010, bug P0): quella
    // reimplementazione scriveva cookie di sessione non firmati, rifiutati
    // da Better Auth a runtime. Il plugin gestisce la firma dei cookie
    // internamente (stesso path del login) e traccia l'admin originale su
    // `session.impersonatedBy`.
    //
    // Nessun `adminUserIds`/`adminRoles` qui: una lista di user id hardcoded
    // per ambiente è sbagliata per costruzione (gli id sono generati per
    // singolo DB, quindi diversi tra dev e prod — bug osservato: chi era in
    // lista su dev falliva l'impersonation in prod). Il gate reale resta
    // `adminRoles: ["admin"]` (default del plugin), e `user.role` viene
    // sincronizzato a "admin" in modo lazy dalla route
    // `/api/admin/impersonate/start` a partire dalla stessa fonte di verità
    // applicativa (`isSviluppo`, email-driven) usata ovunque nel resto
    // dell'app — niente da tenere allineato a mano tra ambienti.
    admin(),
  ],
});

/**
 * Esegue un'operazione sensibile di Better Auth (cambio password/email,
 * verifica password) instradandola attraverso il suo router HTTP
 * (`auth.handler`) invece che tramite `auth.api.*` diretto.
 *
 * `auth.api.*` chiama l'endpoint bypassando completamente il router: niente
 * rate-limit, niente controlli di origine. Per operazioni sensibili come
 * queste va sempre usato questo helper (review T-6, MAJOR #1).
 *
 * Il cookie di sessione della richiesta originale viene inoltrato tale e
 * quale, così Better Auth vede lo stesso utente autenticato; chi chiama è
 * responsabile di propagare eventuali `Set-Cookie` della risposta.
 */
export async function callAuthEndpoint(
  request: Request,
  path: string,
  body: unknown
): Promise<Response> {
  const url = new URL(`/api/auth${path}`, request.url);
  const cookie = request.headers.get("cookie");

  const authRequest = new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Alcuni endpoint (es. /sign-in/email, tramite `formCsrfMiddleware`)
      // richiedono un Origin valido quando la richiesta porta un cookie:
      // qui la request viene costruita a mano, quindi il browser non lo
      // imposta da solo. Riflette l'origine reale della richiesta originale
      // (sempre same-origin, essendo Next.js che chiama se stesso).
      origin: new URL(request.url).origin,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

  return auth.handler(authRequest);
}

// Il primo argomento di `APIError` è tipato come un'unione di literal HTTP
// status ("BAD_REQUEST", 404, ...), non come `number` generico: `response
// .status` (un `number`) non è assegnabile lì senza un cast non sicuro. Qui
// mappiamo lo status numerico alla chiave stringa corrispondente per le
// risposte che gli endpoint di Better Auth usati da questo file possono
// restituire; per uno status non mappato usiamo comunque una chiave valida
// di fallback e preserviamo il numero reale passandolo esplicitamente come
// `statusCode` (4° argomento del costruttore), che i route handler leggono
// via `error.statusCode`.
const API_ERROR_STATUS_KEYS: Record<
  number,
  ConstructorParameters<typeof APIError>[0]
> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE_ENTITY",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_SERVER_ERROR",
};

/**
 * Legge il body JSON di una risposta di `callAuthEndpoint` e, se la
 * risposta non è 2xx, lancia un `APIError` compatibile con quello che
 * lanciano già `auth.api.*`, così i route handler possono continuare a
 * gestire gli errori con un unico blocco `catch (error instanceof APIError)`.
 */
export async function readAuthEndpointResponse<T = Record<string, unknown>>(
  response: Response
): Promise<T> {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const statusKey =
      API_ERROR_STATUS_KEYS[response.status] ?? "INTERNAL_SERVER_ERROR";
    throw new APIError(statusKey, data, undefined, response.status);
  }

  return data as T;
}
