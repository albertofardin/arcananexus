import { NextRequest, NextResponse } from "next/server";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { callAuthEndpoint, readAuthEndpointResponse } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findEmailByUsername } from "@/lib/repositories/user.repository";
import { loginSchema } from "@/lib/validations/login";
import { apiError } from "@/lib/api-helpers";

// Stesso messaggio usato da Better Auth per credenziali errate: se
// l'identificatore è uno username che non risolve a nessun utente,
// rispondiamo con lo stesso errore generico invece di rivelare che
// quello username non esiste (review anti-enumeration).
const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const validation = loginSchema.safeParse(body);
  if (!validation.success) {
    return apiError(400, "Invalid data", validation.error);
  }

  const { identifier, password, rememberMe } = validation.data;

  // L'utente può accedere con email o con lo username (colonna `name`,
  // resa univoca da `@@unique([name])`): il router di Better Auth accetta
  // solo email, quindi la risoluzione username -> email avviene qui, lato
  // server, e l'email risolta non torna mai al client — altrimenti
  // basterebbe indovinare uno username per scoprire l'email associata.
  let email = identifier;
  if (!z.email().safeParse(identifier).success) {
    const resolvedEmail = await findEmailByUsername(prisma, identifier);
    if (!resolvedEmail) {
      return apiError(401, INVALID_CREDENTIALS_MESSAGE);
    }
    email = resolvedEmail;
  }

  try {
    // Instradata attraverso il router HTTP di Better Auth (`auth.handler`,
    // vedi `callAuthEndpoint` in `src/lib/auth.ts`) invece che tramite
    // `auth.api.signInEmail` diretto, per beneficiare del suo rate-limit
    // nativo su /sign-in/* (3 richieste/10s per IP) — stesso pattern già
    // usato da profile/password e profile/update per le altre operazioni
    // sensibili di Better Auth.
    const authResponse = await callAuthEndpoint(request, "/sign-in/email", {
      email,
      password,
      rememberMe,
      // Se il login è bloccato per email non verificata, Better Auth
      // rimanda da sé un nuovo link di conferma (sendOnSignIn): stesso
      // callbackURL del link di registrazione, verso la dashboard.
      callbackURL: "/dashboard",
    });
    const data = await readAuthEndpointResponse(authResponse);

    const response = NextResponse.json(data);
    const setCookieHeader = authResponse.headers.get("set-cookie");
    if (setCookieHeader) {
      response.headers.set("set-cookie", setCookieHeader);
    }
    return response;
  } catch (error) {
    if (error instanceof APIError) {
      // `error.body?.code` (es. "EMAIL_NOT_VERIFIED", T-047) è propagato come
      // `details`: il client lo usa per distinguere via UI un login bloccato
      // da email non verificata da un errore di credenziali, senza inoltrare
      // mai il messaggio inglese di Better Auth.
      return apiError(
        error.statusCode ?? 400,
        error.body?.message ?? error.message,
        error.body?.code
      );
    }
    console.error("Error signing in:", error);
    return apiError(500, "Internal server error");
  }
}
