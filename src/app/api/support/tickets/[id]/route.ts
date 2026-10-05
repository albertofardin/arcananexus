import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEffectiveUserId, getUserGroupFlags } from "@/lib/authorization";
import {
  deleteSupportTicket,
  getSupportTicketById,
  getSupportTicketWithMessages,
} from "@/lib/repositories/support.repository";
import { supportTicketDetailSchema } from "@/lib/validations/support";
import { apiError } from "@/lib/api-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseTicketId(id: string): number | null {
  const ticketId = Number(id);
  return Number.isInteger(ticketId) && ticketId > 0 ? ticketId : null;
}

// Dettaglio + thread messaggi: proprietario del ticket OPPURE staff
// (`isSviluppo` effettivo), altrimenti 404 — mai un 403 che ne riveli
// l'esistenza a un utente non autorizzato (stesso principio "tenant
// scoping" applicato qui al Supporto, che non ha una campagna da cui
// derivarlo).
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getEffectiveUserId(request.headers);
  if (!userId) {
    return apiError(401, "Non autenticato");
  }

  const ticketId = parseTicketId(id);
  if (ticketId === null) {
    return apiError(400, "Id segnalazione non valido");
  }

  try {
    const ticket = await getSupportTicketWithMessages(prisma, ticketId);
    if (!ticket) {
      return apiError(404, "Segnalazione non trovata");
    }

    const flags = await getUserGroupFlags(prisma, userId);
    const isStaff = flags?.isSviluppo === true;
    const isOwnTicket = ticket.userId === userId;
    if (!isOwnTicket && !isStaff) {
      return apiError(404, "Segnalazione non trovata");
    }

    const response = supportTicketDetailSchema.parse({
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      messages: ticket.messages,
      isOwnTicket,
      isStaff,
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching support ticket:", error);
    return apiError(500, "Internal server error");
  }
}

// Cancellazione definitiva: solo staff (`isSviluppo` effettivo) — un
// proprietario, anche autore, non può cancellare la propria segnalazione.
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getEffectiveUserId(request.headers);
  if (!userId) {
    return apiError(401, "Non autenticato");
  }

  const ticketId = parseTicketId(id);
  if (ticketId === null) {
    return apiError(400, "Id segnalazione non valido");
  }

  try {
    const flags = await getUserGroupFlags(prisma, userId);
    if (flags?.isSviluppo !== true) {
      return apiError(403, "Permessi insufficienti");
    }

    const ticket = await getSupportTicketById(prisma, ticketId);
    if (!ticket) {
      return apiError(404, "Segnalazione non trovata");
    }

    await deleteSupportTicket(prisma, ticketId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting support ticket:", error);
    return apiError(500, "Internal server error");
  }
}
