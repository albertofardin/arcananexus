import { notFound } from "next/navigation";
import { headers } from "next/headers";
import SupportTicketThread from "@/components/SupportPage/SupportTicketThread";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getUserGroupFlags } from "@/lib/authorization";
import { getSupportTicketWithMessages } from "@/lib/repositories/support.repository";

// Dettaglio + thread di una segnalazione (T-0xx, "Supporto"): proprietario
// del ticket OPPURE staff (`isSviluppo` effettivo), altrimenti 404 — mai un
// 403 che ne riveli l'esistenza, stesso principio applicato dalla route API
// gemella (`GET /api/support/tickets/[id]`).
export default async function Page({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId: rawTicketId } = await params;
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user) {
    notFound();
  }

  const ticketId = Number(rawTicketId);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    notFound();
  }

  const ticket = await getSupportTicketWithMessages(prisma, ticketId);
  if (!ticket) {
    notFound();
  }

  const flags = await getUserGroupFlags(prisma, session.user.id);
  const isStaff = flags?.isSviluppo === true;
  const isOwnTicket = ticket.userId === session.user.id;
  if (!isOwnTicket && !isStaff) {
    notFound();
  }

  return (
    <SupportTicketThread
      ticket={{
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        messages: ticket.messages,
        isOwnTicket,
        isStaff,
      }}
    />
  );
}
