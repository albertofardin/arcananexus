import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEffectiveUserId, getUserGroupFlags } from "@/lib/authorization";
import {
  addSupportMessage,
  getSupportTicketWithMessages,
} from "@/lib/repositories/support.repository";
import { addSupportMessageSchema } from "@/lib/validations/support";
import { apiError } from "@/lib/api-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Aggiunge un messaggio al thread: stessa autorizzazione del dettaglio
// (`GET .../tickets/[id]`) — proprietario del ticket OPPURE staff, 404 (mai
// 403) per chiunque altro.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const userId = await getEffectiveUserId(request.headers);
  if (!userId) {
    return apiError(401, "Non autenticato");
  }

  const ticketId = Number(id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return apiError(400, "Id segnalazione non valido");
  }

  const body = await request.json().catch(() => null);
  const parsedBody = addSupportMessageSchema.safeParse(body);
  if (!parsedBody.success) {
    return apiError(400, "Dati non validi", parsedBody.error.flatten());
  }

  try {
    const ticket = await getSupportTicketWithMessages(prisma, ticketId);
    if (!ticket) {
      return apiError(404, "Segnalazione non trovata");
    }

    const flags = await getUserGroupFlags(prisma, userId);
    const isStaff = flags?.isSviluppo === true;
    if (ticket.userId !== userId && !isStaff) {
      return apiError(404, "Segnalazione non trovata");
    }

    const message = await addSupportMessage(prisma, {
      ticketId,
      authorId: userId,
      body: parsedBody.data.body,
      isStaffAuthor: isStaff,
    });
    if (!message) {
      return apiError(404, "Segnalazione non trovata");
    }

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("Error adding support message:", error);
    return apiError(500, "Internal server error");
  }
}
