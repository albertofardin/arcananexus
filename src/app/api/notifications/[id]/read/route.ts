import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEffectiveUserId } from "@/lib/authorization";
import { markNotificationRead } from "@/lib/repositories/notification.repository";
import { apiError } from "@/lib/api-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Segna una notifica come letta (T-0xx, pannello notifiche — FASE 1
// backend): scopata a `userId` (mai un id nudo, vedi `markNotificationRead`)
// — un id di un'altra utente non aggiorna nulla né rivela la sua esistenza
// con un errore diverso. Nessun altro side-effect (il redirect verso la
// missiva/PG/azione downtime referenziata lo farà il client, FASE 2).
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const userId = await getEffectiveUserId(request.headers);
  if (!userId) {
    return apiError(401, "Non autenticato");
  }

  const notificationId = Number(id);
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return apiError(400, "Id notifica non valido");
  }

  try {
    const updated = await markNotificationRead(prisma, {
      id: notificationId,
      userId,
    });
    if (!updated) {
      return apiError(404, "Notifica non trovata");
    }

    return NextResponse.json({ read: true });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return apiError(500, "Internal server error");
  }
}
