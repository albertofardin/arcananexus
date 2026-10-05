import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Deve restare edge-safe: nessun import che trascini Prisma (`@/lib/auth`),
// altrimenti il modulo fallisce a caricarsi sotto il runtime edge di `next
// dev`/Turbopack e la redirect smette di scattare anche per il caso banale
// (cookie assente). Il controllo qui è quindi solo "il cookie c'è?": la
// validità reale della sessione (scaduta/revocata) è verificata lato server
// in `src/app/(dashboard)/dashboard/layout.tsx`, che gira in Node.js e può
// usare `auth.api.getSession` in sicurezza.
function isDashboardPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

function redirectToLogin(request: NextRequest) {
  const url = new URL("/", request.url);
  url.searchParams.set("login", "1");
  url.searchParams.set(
    "redirectTo",
    request.nextUrl.pathname + request.nextUrl.search
  );
  return NextResponse.redirect(url);
}

export function middleware(request: NextRequest) {
  // `getSessionCookie` (edge-safe, non tocca Prisma) controlla sia il nome
  // cookie nudo sia la variante con prefisso `__Secure-` che Better Auth usa
  // quando `baseURL` è https (prod): un controllo hardcoded sul solo nome
  // nudo (bug osservato in prod, in particolare da mobile: sessione creata
  // correttamente ma mai riconosciuta qui, redirect loop verso il login).
  const sessionCookie = getSessionCookie(request);
  const isDashboard = isDashboardPath(request.nextUrl.pathname);

  if (!sessionCookie) {
    // Solo `/dashboard` richiede una sessione: le altre pagine (homepage,
    // `/installa-app`, ecc.) sono pubbliche e vanno lasciate passare, non
    // rimandate a "/" — altrimenti un visitatore anonimo che naviga verso
    // una qualunque pagina pubblica diversa dalla home viene rimbalzato lì
    // (bug osservato su "/installa-app": il click restava sulla homepage).
    return isDashboard ? redirectToLogin(request) : NextResponse.next();
  }

  if (isDashboard) {
    // Inoltra il path corrente al layout server-side, così se la sessione
    // risulta scaduta/invalida può ricostruire lo stesso `redirectTo`.
    const headers = new Headers(request.headers);
    headers.set(
      "x-pathname",
      request.nextUrl.pathname + request.nextUrl.search
    );
    return NextResponse.next({ request: { headers } });
  }

  return NextResponse.next();
}

export const config = {
  // Tutte le route API gestiscono già da sole l'autenticazione (vedi
  // `auth.api.getSession`/le guardie in `src/lib/authorization.ts`), quindi
  // il middleware non deve girare su `/api/*`: prima escludeva solo
  // `api/auth`, lasciando passare `api/login` e `api/signup` (endpoint
  // pubblici, senza cookie per definizione) nel ramo che rimanda ogni
  // richiesta senza cookie a "/" — un POST veniva quindi 307-redirezionato
  // prima ancora di raggiungere la route, facendo fallire silenziosamente
  // login e registrazione (bug osservato in staging).
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|$|.*\\..*).*)"],
};
