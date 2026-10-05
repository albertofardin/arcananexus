import { NextRequest, NextResponse } from "next/server";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { getSessionContext } from "@/lib/impersonation";

export async function POST(request: NextRequest) {
  const context = await getSessionContext(request.headers);

  if (!context?.isImpersonating) {
    return NextResponse.json(
      { error: "Nessuna impersonificazione attiva" },
      { status: 400 }
    );
  }

  try {
    // Ripristina la sessione admin originale (cookie `admin_session`
    // impostato da `impersonateUser`) tramite il plugin `admin` di Better
    // Auth (T-010, bug P0): niente più lettura/scrittura manuale del
    // cookie di sessione grezzo.
    const { headers: authHeaders } = await auth.api.stopImpersonating({
      headers: request.headers,
      returnHeaders: true,
    });

    const response = NextResponse.json({ success: true });

    for (const cookie of authHeaders.getSetCookie()) {
      response.headers.append("set-cookie", cookie);
    }

    return response;
  } catch (error) {
    if (error instanceof APIError) {
      return NextResponse.json(
        { error: "Impossibile terminare l'impersonazione" },
        { status: error.statusCode ?? 400 }
      );
    }
    console.error("Error ending impersonation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
