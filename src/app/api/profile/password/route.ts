import { NextRequest, NextResponse } from "next/server";
import { APIError } from "better-auth/api";
import { callAuthEndpoint, readAuthEndpointResponse } from "@/lib/auth";
import { getSessionContext } from "@/lib/impersonation";
import { updatePasswordSchema } from "@/lib/validations/profile";
import { apiError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  const context = await getSessionContext(request.headers);
  if (!context) {
    return apiError(401, "Not authenticated");
  }

  // Un admin che sta impersonando un altro utente non deve poter cambiare
  // la password del target: significherebbe di fatto rubargli l'accesso
  // all'account anche dopo la fine dell'impersonificazione (review T-6,
  // MAJOR #2).
  if (context.isImpersonating) {
    return apiError(
      403,
      "Operazione non consentita durante l'impersonificazione"
    );
  }

  const body = await request.json();
  const validation = updatePasswordSchema.safeParse(body);
  if (!validation.success) {
    return apiError(400, "Invalid data", validation.error);
  }

  const { currentPassword, newPassword } = validation.data;

  try {
    // Instradata attraverso il router HTTP di Better Auth (`auth.handler`,
    // vedi `callAuthEndpoint`) invece di `auth.api.changePassword` diretto:
    // solo passando dal router si applica il rate-limit nativo su
    // /change-password (3 richieste/10s per IP). Una chiamata diretta ad
    // `auth.api.*` lo bypassa del tutto, aprendo a brute-force sulla
    // password attuale (review T-6, MAJOR #1).
    const authResponse = await callAuthEndpoint(request, "/change-password", {
      currentPassword,
      newPassword,
    });
    await readAuthEndpointResponse(authResponse);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof APIError) {
      return apiError(
        error.statusCode ?? 400,
        error.body?.message ?? error.message
      );
    }
    console.error("Error updating password:", error);
    return apiError(500, "Internal server error");
  }
}
