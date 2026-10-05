import { NextRequest, NextResponse } from "next/server";
import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  canManageEvents,
  checkAssociationQuotaAccess,
} from "@/lib/authorization";
import { getEventByIdScoped } from "@/lib/repositories/event.repository";
import { getGrant } from "@/lib/repositories/grant.repository";
import {
  createFreeBooking,
  getBookingForUser,
} from "@/lib/repositories/booking.repository";
import { eventStaffSchema } from "@/lib/validations/event";
import { createNotification } from "@/lib/repositories/notification.repository";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ eventId: string }>;
}

// Il master iscrive gratuitamente un membro dello staff della campagna
// dell'evento (solo eventi di campagna; nessun pagamento né personaggio).
export async function POST(request: NextRequest, { params }: RouteContext) {
  const eventId = Number((await params).eventId);
  if (!Number.isInteger(eventId)) return apiError(404, "Evento non trovato");

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return apiError(401, "Non autenticato");

  const parsed = eventStaffSchema.safeParse(await request.json());
  if (!parsed.success) return apiError(400, "Dati non validi");

  try {
    const event = await getEventByIdScoped(prisma, eventId, ARCANA_DOMINE_SLUG);
    if (!event) return apiError(404, "Evento non trovato");
    if (event.campaignId === null) {
      return apiError(400, "Solo gli eventi di campagna hanno uno staff");
    }
    if (!(await canManageEvents(prisma, session.user.id, event.campaignId))) {
      return apiError(403, "Permessi insufficienti");
    }

    const { userId, notify } = parsed.data;
    if (!(await getGrant(prisma, userId, event.campaignId))) {
      return apiError(400, "L'utente non fa parte dello staff della campagna");
    }
    if (await getBookingForUser(prisma, eventId, userId)) {
      return apiError(409, "L'utente è già iscritto");
    }
    if (!(await checkAssociationQuotaAccess(prisma, userId))) {
      return apiError(400, "L'utente non è tesserato all'associazione");
    }

    await createFreeBooking(prisma, { eventId, userId, addedByStaff: true });
    if (notify && userId !== session.user.id) {
      await createNotification(prisma, {
        userId: userId,
        campaignId: event.campaignId,
        type: NotificationType.event_booking,
        entityId: eventId,
      });
    }
    return NextResponse.json({ status: "registered" }, { status: 201 });
  } catch (error) {
    console.error("Error adding staff to event:", error);
    return apiError(500, "Internal server error");
  }
}
