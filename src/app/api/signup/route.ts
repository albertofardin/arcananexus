import { NextRequest, NextResponse } from "next/server";
import { APIError } from "better-auth/api";
import { callAuthEndpoint, readAuthEndpointResponse } from "@/lib/auth";
import { signupSchema } from "@/lib/validations/signup";
import { apiError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const validation = signupSchema.safeParse(body);
  if (!validation.success) {
    return apiError(400, "Invalid data", validation.error);
  }

  const { email, name, password } = validation.data;

  try {
    // Instradata attraverso il router HTTP di Better Auth (`auth.handler`,
    // vedi `callAuthEndpoint` in `src/lib/auth.ts`) invece che tramite
    // `auth.api.signUpEmail` diretto, per beneficiare del suo rate-limit
    // nativo su /sign-up/* — stesso pattern già usato da `/api/login`.
    const authResponse = await callAuthEndpoint(request, "/sign-up/email", {
      email,
      password,
      name,
      // Il link di conferma email deve riportare l'utente già loggato
      // (autoSignInAfterVerification) direttamente in dashboard, non sulla
      // home del sito vetrina.
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
      // A differenza del login, qui non c'è motivo anti-enumeration: in fase
      // di registrazione è normale e utile dire all'utente che email/
      // username sono già in uso (es. "Nome utente già in uso" dal
      // databaseHook in src/lib/auth.ts, o l'errore nativo di Better Auth
      // per email duplicata).
      return apiError(
        error.statusCode ?? 400,
        error.body?.message ?? error.message
      );
    }
    console.error("Error signing up:", error);
    return apiError(500, "Internal server error");
  }
}
