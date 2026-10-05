import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEffectiveUserId } from "@/lib/authorization";
import { saveSubscription } from "@/lib/repositories/pushSubscription.repository";
import { pushSubscribeSchema } from "@/lib/validations/pushSubscription";
import { apiError } from "@/lib/api-helpers";

// Salva/aggiorna la subscription Web Push del dispositivo corrente (T-0xx,
// notifiche push mobile): scopata a `userId` risolto server-side, mai
// accettato dal client — stesso principio di `POST /api/support/tickets`.
export async function POST(request: NextRequest) {
  const userId = await getEffectiveUserId(request.headers);
  if (!userId) {
    return apiError(401, "Non autenticato");
  }

  const body = await request.json().catch(() => null);
  const parsedBody = pushSubscribeSchema.safeParse(body);
  if (!parsedBody.success) {
    return apiError(400, "Dati non validi", parsedBody.error.flatten());
  }

  try {
    await saveSubscription(prisma, {
      userId,
      endpoint: parsedBody.data.endpoint,
      p256dh: parsedBody.data.keys.p256dh,
      auth: parsedBody.data.keys.auth,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Error saving push subscription:", error);
    return apiError(500, "Internal server error");
  }
}
