import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEffectiveUserId, getUserGroupFlags } from "@/lib/authorization";
import {
  getSupportTicketById,
  updateSupportTicketStatus,
} from "@/lib/repositories/support.repository";
import { updateSupportTicketStatusSchema } from "@/lib/validations/support";
import { apiError } from "@/lib/api-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Cambio stato manuale: solo staff (`isSviluppo` effettivo) — il
// proprietario del ticket non ha alcun controllo diretto sullo stato
// (riapre il ticket solo scrivendo un nuovo messaggio, vedi
// `addSupportMessage`).
export async function PATCH(request: NextRequest, { params }: RouteContext) {
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
  const parsedBody = updateSupportTicketStatusSchema.safeParse(body);
  if (!parsedBody.success) {
    return apiError(400, "Dati non validi", parsedBody.error.flatten());
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

    const updated = await updateSupportTicketStatus(
      prisma,
      ticketId,
      parsedBody.data.status
    );
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating support ticket status:", error);
    return apiError(500, "Internal server error");
  }
}
