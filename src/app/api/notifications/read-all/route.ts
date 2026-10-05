import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEffectiveUserId } from "@/lib/authorization";
import { markAllNotificationsRead } from "@/lib/repositories/notification.repository";
import { apiError } from "@/lib/api-helpers";

// Segna tutte le notifiche non lette dell'utente della sessione come lette
// (T-0xx, pannello notifiche — bottone "Segna tutte come lette"): scopata a
// `userId` risolto server-side (`getEffectiveUserId`, impersonation-aware,
// stesso principio di `GET /api/notifications`), mai un parametro accettato
// dal client — nessun `userId`/filtro di campagna in ingresso, è sempre
// "tutte le notifiche di chi sta chiamando", cross-campagna.
export async function PATCH(request: NextRequest) {
  const userId = await getEffectiveUserId(request.headers);
  if (!userId) {
    return apiError(401, "Non autenticato");
  }

  try {
    const count = await markAllNotificationsRead(prisma, userId);
    return NextResponse.json({ count });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return apiError(500, "Internal server error");
  }
}
