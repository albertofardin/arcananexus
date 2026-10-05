import { NextRequest, NextResponse } from "next/server";
import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  canManageEvents,
  checkAssociationQuotaAccess,
} from "@/lib/authorization";
import { getEventByIdScoped } from "@/lib/repositories/event.repository";
import { getCharacterInCampaign } from "@/lib/repositories/character.repository";
import {
  createFreeBooking,
  getBookingForUser,
} from "@/lib/repositories/booking.repository";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus/status";
import { eventPlayerSchema } from "@/lib/validations/event";
import { createNotification } from "@/lib/repositories/notification.repository";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ eventId: string }>;
}

// Il master iscrive gratuitamente un personaggio giocatore approvato della
// campagna dell'evento (nessun pagamento né requisiti d'iscrizione).
export async function POST(request: NextRequest, { params }: RouteContext) {
  const eventId = Number((await params).eventId);
  if (!Number.isInteger(eventId)) return apiError(404, "Evento non trovato");

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return apiError(401, "Non autenticato");

  const parsed = eventPlayerSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) return apiError(400, "Dati non validi");

  try {
    const event = await getEventByIdScoped(prisma, eventId, ARCANA_DOMINE_SLUG);
    if (!event) return apiError(404, "Evento non trovato");
    if (event.campaignId === null) {
      return apiError(400, "Solo gli eventi di campagna hanno personaggi");
    }
    if (!(await canManageEvents(prisma, session.user.id, event.campaignId))) {
      return apiError(403, "Permessi insufficienti");
    }

    const character = await getCharacterInCampaign(
      prisma,
      parsed.data.characterId,
      event.campaignId
    );
    if (
      !character ||
      character.type !== "pg" ||
      getCharacterStatus(character) !== "approved"
    ) {
      return apiError(400, "Personaggio non valido per questa campagna");
    }
    if (await getBookingForUser(prisma, eventId, character.userId)) {
      return apiError(409, "Il giocatore è già iscritto");
    }
    if (!(await checkAssociationQuotaAccess(prisma, character.userId))) {
      return apiError(400, "Il giocatore non è tesserato all'associazione");
    }

    await createFreeBooking(prisma, {
      eventId,
      userId: character.userId,
      characterId: character.id,
    });
    if (parsed.data.notify && character.userId !== session.user.id) {
      await createNotification(prisma, {
        userId: character.userId,
        campaignId: event.campaignId,
        type: NotificationType.event_booking,
        entityId: eventId,
      });
    }
    return NextResponse.json({ status: "registered" }, { status: 201 });
  } catch (error) {
    console.error("Error adding player to event:", error);
    return apiError(500, "Internal server error");
  }
}
