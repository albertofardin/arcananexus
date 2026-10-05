import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { canManageEvents } from "@/lib/authorization";
import { getEventByIdScoped } from "@/lib/repositories/event.repository";
import { listEventBookings } from "@/lib/repositories/booking.repository";
import { bookingsToCsv } from "@/lib/eventBookingsCsv";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ eventId: string }>;
}

// Export CSV degli iscritti (persona + personaggio), solo per chi gestisce
// l'evento.
export async function GET(request: NextRequest, { params }: RouteContext) {
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

    const csv = bookingsToCsv(
      await listEventBookings(prisma, eventId),
      event.paymentOptions.length > 0
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="iscritti-evento-${eventId}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error exporting event bookings:", error);
    return apiError(500, "Internal server error");
  }
}
