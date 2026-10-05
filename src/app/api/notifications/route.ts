import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEffectiveUserId } from "@/lib/authorization";
import {
  countUnreadNotifications,
  deleteAllNotifications,
  listNotificationsForUser,
} from "@/lib/repositories/notification.repository";
import { notificationListResponseSchema } from "@/lib/validations/notification";
import { apiError } from "@/lib/api-helpers";

// Pannello notifiche stile Facebook (T-0xx, FASE 1 backend — la UI arriva in
// FASE 2, questo è il contratto su cui si baserà): elenco cross-campagna
// dell'utente della sessione corrente, SEMPRE scopato a `userId` risolto
// server-side — mai un parametro accettato dal client (nessun `userId` in
// query string). `getEffectiveUserId` (non `auth.api.getSession` diretto):
// stesso helper impersonation-aware già usato da `GET /api/me/capabilities`
// per le letture cross-campagna legate alla sessione — durante
// un'impersonation il pannello deve riflettere le notifiche dell'utente
// impersonato, non quelle dell'admin che sta impersonando.
export async function GET(request: NextRequest) {
  const userId = await getEffectiveUserId(request.headers);
  if (!userId) {
    return apiError(401, "Non autenticato");
  }

  try {
    const [notifications, unreadCount] = await Promise.all([
      listNotificationsForUser(prisma, { userId }),
      countUnreadNotifications(prisma, userId),
    ]);

    const response = notificationListResponseSchema.parse({
      notifications,
      unreadCount,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return apiError(500, "Internal server error");
  }
}

// Bottone "Elimina tutte" nel pannello: stessa scopatura a `userId`
// risolto server-side di `GET`, nessun parametro accettato dal client.
export async function DELETE(request: NextRequest) {
  const userId = await getEffectiveUserId(request.headers);
  if (!userId) {
    return apiError(401, "Non autenticato");
  }

  try {
    const count = await deleteAllNotifications(prisma, userId);
    return NextResponse.json({ count });
  } catch (error) {
    console.error("Error deleting all notifications:", error);
    return apiError(500, "Internal server error");
  }
}
