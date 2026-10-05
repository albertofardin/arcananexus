import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { canManageEvents } from "@/lib/authorization";
import {
  getEventByIdScoped,
  updateEvent,
  deleteEvent,
  countPaidBookings,
} from "@/lib/repositories/event.repository";
import { eventWriteSchema } from "@/lib/validations/event";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ eventId: string }>;
}

// Modifica evento. La campagna non è modificabile: un evento resta nella
// campagna (o senza campagna) in cui è stato creato; `campaignSlug` nel body
// viene ignorato.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const eventId = Number((await params).eventId);
  if (!Number.isInteger(eventId)) return apiError(404, "Evento non trovato");

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return apiError(401, "Non autenticato");

  const parsed = eventWriteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError(400, "Dati non validi", parsed.error.flatten());
  }
  const { campaignSlug: _ignored, ...input } = parsed.data;

  try {
    const event = await getEventByIdScoped(prisma, eventId, ARCANA_DOMINE_SLUG);
    if (!event) return apiError(404, "Evento non trovato");

    if (!(await canManageEvents(prisma, session.user.id, event.campaignId))) {
      return apiError(403, "Permessi insufficienti");
    }

    const updated = await updateEvent(prisma, event.id, event.organizationId, {
      ...input,
      campaignId: event.campaignId,
    });

    return NextResponse.json({
      id: updated.id,
      campaignSlug: event.campaign?.slug ?? null,
    });
  } catch (error) {
    console.error("Error updating event:", error);
    return apiError(500, "Internal server error");
  }
}

// Eliminazione evento: vietata se ha iscrizioni a pagamento (solo nascondibile).
// Le eventuali iscrizioni gratuite/staff vengono eliminate in cascata.
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const eventId = Number((await params).eventId);
  if (!Number.isInteger(eventId)) return apiError(404, "Evento non trovato");

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return apiError(401, "Non autenticato");

  try {
    const event = await getEventByIdScoped(prisma, eventId, ARCANA_DOMINE_SLUG);
    if (!event) return apiError(404, "Evento non trovato");

    if (!(await canManageEvents(prisma, session.user.id, event.campaignId))) {
      return apiError(403, "Permessi insufficienti");
    }

    if ((await countPaidBookings(prisma, event.id)) > 0) {
      return apiError(
        409,
        "L'evento ha iscrizioni a pagamento e non può essere eliminato: puoi solo nasconderlo"
      );
    }

    await deleteEvent(prisma, event.id, event.organizationId);
    return NextResponse.json({ campaignSlug: event.campaign?.slug ?? null });
  } catch (error) {
    console.error("Error deleting event:", error);
    return apiError(500, "Internal server error");
  }
}
