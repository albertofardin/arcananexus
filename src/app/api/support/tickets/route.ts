import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEffectiveUserId, getUserGroupFlags } from "@/lib/authorization";
import {
  createSupportTicket,
  listAllSupportTickets,
  listSupportTicketsForUser,
} from "@/lib/repositories/support.repository";
import {
  createSupportTicketSchema,
  supportTicketListResponseSchema,
} from "@/lib/validations/support";
import { apiError } from "@/lib/api-helpers";

// "Supporto" (T-0xx): non campaign-scoped, `getEffectiveUserId` (non
// `auth.api.getSession` diretto) perché deve funzionare anche durante
// un'impersonation — stesso principio di `GET /api/notifications`.

// Lista dei ticket: lo staff (`isSviluppo` effettivo) vede tutti i ticket
// di tutti gli utenti, chiunque altro vede solo i propri.
export async function GET(request: NextRequest) {
  const userId = await getEffectiveUserId(request.headers);
  if (!userId) {
    return apiError(401, "Non autenticato");
  }

  try {
    const flags = await getUserGroupFlags(prisma, userId);
    const isStaff = flags?.isSviluppo === true;

    const tickets = isStaff
      ? await listAllSupportTickets(prisma)
      : await listSupportTicketsForUser(prisma, userId);

    const response = supportTicketListResponseSchema.parse({
      tickets,
      isStaff,
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching support tickets:", error);
    return apiError(500, "Internal server error");
  }
}

// Apre un nuovo ticket: chiunque sia autenticato, nessun ruolo richiesto
// (stessa soglia permissiva di `richTextImageUploader`).
export async function POST(request: NextRequest) {
  const userId = await getEffectiveUserId(request.headers);
  if (!userId) {
    return apiError(401, "Non autenticato");
  }

  const body = await request.json().catch(() => null);
  const parsedBody = createSupportTicketSchema.safeParse(body);
  if (!parsedBody.success) {
    return apiError(400, "Dati non validi", parsedBody.error.flatten());
  }

  try {
    const ticket = await createSupportTicket(prisma, {
      userId,
      subject: parsedBody.data.subject,
      body: parsedBody.data.body,
    });
    return NextResponse.json(ticket, { status: 201 });
  } catch (error) {
    console.error("Error creating support ticket:", error);
    return apiError(500, "Internal server error");
  }
}
