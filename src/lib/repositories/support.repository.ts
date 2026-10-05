import {
  NotificationType,
  type Prisma,
  type PrismaClient,
  type SupportMessage,
  type SupportTicket,
  type SupportTicketStatus,
} from "@prisma/client";
import {
  createNotification,
  createNotifications,
} from "./notification.repository";
import type { PrismaTransactionClient } from "./types";
import {
  HARDCODED_SVILUPPO_EMAILS,
  isHardcodedSviluppo,
} from "@/lib/constants";

// "Supporto" (T-0xx): ticket di assistenza utente → team di sviluppo, non
// campaign-scoped (a differenza di missive/downtime). Segue lo stesso
// pattern funzionale degli altri repository (`PrismaClient |
// Prisma.TransactionClient` come primo argomento dove serve comporsi dentro
// una transazione, mai `prisma` statico importato qui).

// Destinatari del fan-out "team di supporto": stesso criterio "effettivo"
// di `getUserGroupFlags` in `authorization.ts` (DB flag OR email cablata),
// duplicato qui invece di importare da `authorization.ts` perché quel
// modulo lavora per-utente (`getUserGroupFlags(prisma, userId)`), non con
// una query di elenco — serve il set intero per il `createMany` sotto.
// `excludeUserId` copre il caso limite in cui l'autore del ticket/messaggio
// sia lui stesso dello staff: non deve notificare se stesso.
async function listSupportStaffUserIds(
  prisma: PrismaTransactionClient,
  excludeUserId: string
): Promise<string[]> {
  const staff = await prisma.user.findMany({
    where: {
      OR: [
        { isSviluppo: true },
        { email: { in: [...HARDCODED_SVILUPPO_EMAILS] } },
      ],
    },
    select: { id: true },
  });
  return staff.map(user => user.id).filter(id => id !== excludeUserId);
}

export interface CreateSupportTicketInput {
  userId: string;
  subject: string;
  body: string;
}

// Crea il ticket + il primo messaggio in un'unica transazione, poi avvisa
// tutto lo staff (`support_new`) — mai un salvataggio separato, stesso
// principio di `createDowntimeAction`/`createNotification` dentro la
// stessa `$transaction` della scrittura che li genera.
export async function createSupportTicket(
  prisma: PrismaClient,
  { userId, subject, body }: CreateSupportTicketInput
): Promise<SupportTicket> {
  return prisma.$transaction(async tx => {
    const ticket = await tx.supportTicket.create({ data: { userId, subject } });
    await tx.supportMessage.create({
      data: { ticketId: ticket.id, authorId: userId, body },
    });

    const staffIds = await listSupportStaffUserIds(tx, userId);
    await createNotifications(
      tx,
      staffIds.map(staffId => ({
        userId: staffId,
        type: NotificationType.support_new,
        entityId: ticket.id,
      }))
    );

    return ticket;
  });
}

export interface SupportTicketListItem {
  id: number;
  subject: string;
  status: SupportTicketStatus;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  lastMessagePreview: string | null;
  author: { name: string; email: string };
}

const SUPPORT_PREVIEW_MAX_LENGTH = 140;

// Il corpo di un messaggio è HTML (`FieldRichText`): l'anteprima in lista
// mostra solo il testo, mai i tag — uno snippet in stile email, non un
// rendering fedele.
function toPreviewText(html: string): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > SUPPORT_PREVIEW_MAX_LENGTH
    ? `${text.slice(0, SUPPORT_PREVIEW_MAX_LENGTH)}…`
    : text;
}

const supportTicketListInclude = {
  user: { select: { name: true, email: true } },
  messages: {
    select: { body: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
  _count: { select: { messages: true } },
} satisfies Prisma.SupportTicketInclude;

type SupportTicketListRow = Prisma.SupportTicketGetPayload<{
  include: typeof supportTicketListInclude;
}>;

function toListItem(ticket: SupportTicketListRow): SupportTicketListItem {
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    messageCount: ticket._count.messages,
    lastMessagePreview: ticket.messages[0]
      ? toPreviewText(ticket.messages[0].body)
      : null,
    author: ticket.user,
  };
}

// Ticket del solo utente della sessione, più recenti in cima. `author` è
// sempre l'utente stesso qui — incluso comunque per condividere lo stesso
// `SupportTicketListItem`/`toListItem` di `listAllSupportTickets`, la UI
// (non-staff) semplicemente non lo mostra.
export async function listSupportTicketsForUser(
  prisma: PrismaClient,
  userId: string
): Promise<SupportTicketListItem[]> {
  const tickets = await prisma.supportTicket.findMany({
    where: { userId },
    include: supportTicketListInclude,
    orderBy: { updatedAt: "desc" },
  });
  return tickets.map(toListItem);
}

// Vista staff (`isSviluppo`): tutti i ticket di tutti gli utenti. Nessuno
// scoping di campagna qui (il Supporto non è campaign-scoped) — l'unica
// autorizzazione è "fai parte dello staff", applicata dalla route, non da
// questa funzione.
export async function listAllSupportTickets(
  prisma: PrismaClient
): Promise<SupportTicketListItem[]> {
  const tickets = await prisma.supportTicket.findMany({
    include: supportTicketListInclude,
    orderBy: { updatedAt: "desc" },
  });
  return tickets.map(toListItem);
}

// Scoped lookup leggero (id/proprietario/stato), usato dalle route
// status/delete solo per verificare che il ticket esista prima di scrivere
// — mai per l'autorizzazione "proprietario", che serve invece il dettaglio
// completo (`getSupportTicketWithMessages`).
export async function getSupportTicketById(
  prisma: PrismaClient,
  ticketId: number
): Promise<SupportTicket | null> {
  return prisma.supportTicket.findUnique({ where: { id: ticketId } });
}

export interface SupportMessageWithAuthor {
  id: number;
  body: string;
  createdAt: Date;
  authorId: string;
  authorName: string;
  authorImage: string | null;
  // Risolto LIVE da `User.isSviluppo`/le email cablate a ogni lettura, mai
  // uno snapshot salvato sul messaggio — stesso principio "mai denormalizzare"
  // già seguito da `Notification` (vedi il commento sul model in
  // `schema.prisma`): se un utente entra/esce dallo staff, i messaggi
  // passati riflettono subito lo stato attuale.
  isStaffAuthor: boolean;
}

export interface SupportTicketWithMessages {
  id: number;
  userId: string;
  subject: string;
  status: SupportTicketStatus;
  createdAt: Date;
  updatedAt: Date;
  messages: SupportMessageWithAuthor[];
}

// Dettaglio + thread messaggi, ordine cronologico. Usata sia per il
// proprietario del ticket sia per lo staff: l'autorizzazione (proprietario
// OPPURE `isSviluppo`) è responsabilità della route, non di questa
// funzione — stesso principio di `getCharacterEditorData`.
export async function getSupportTicketWithMessages(
  prisma: PrismaClient,
  ticketId: number
): Promise<SupportTicketWithMessages | null> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              isSviluppo: true,
            },
          },
        },
      },
    },
  });
  if (!ticket) return null;

  return {
    id: ticket.id,
    userId: ticket.userId,
    subject: ticket.subject,
    status: ticket.status,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    messages: ticket.messages.map(message => ({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      authorId: message.authorId,
      authorName: message.author.name,
      authorImage: message.author.image,
      isStaffAuthor:
        message.author.isSviluppo || isHardcodedSviluppo(message.author.email),
    })),
  };
}

export interface AddSupportMessageInput {
  ticketId: number;
  authorId: string;
  body: string;
  // Calcolato dalla route (`isSviluppo` effettivo dell'autore), non
  // ridedotto qui: decide sia la transizione di stato "in_lavorazione" sia
  // chi è "l'altra parte" da notificare sotto.
  isStaffAuthor: boolean;
}

// Aggiunge un messaggio al thread, aggiorna lo stato del ticket quando
// serve e notifica l'altra parte (`support_reply`). Ritorna `null` se il
// ticket non esiste (la route ha comunque già verificato l'esistenza per
// l'autorizzazione, questo è solo un ulteriore livello di sicurezza contro
// una cancellazione concorrente).
export async function addSupportMessage(
  prisma: PrismaClient,
  { ticketId, authorId, body, isStaffAuthor }: AddSupportMessageInput
): Promise<SupportMessage | null> {
  return prisma.$transaction(async tx => {
    const ticket = await tx.supportTicket.findUnique({
      where: { id: ticketId },
      select: { userId: true, status: true },
    });
    if (!ticket) return null;

    const message = await tx.supportMessage.create({
      data: { ticketId, authorId, body },
    });

    // Riapertura automatica: un ticket risolto/chiuso torna "in_attesa" a
    // QUALUNQUE nuovo messaggio, indipendentemente da chi scrive. Lo staff
    // che risponde per primo a un ticket "in_attesa" lo avanza invece a
    // "in_lavorazione" — mai il contrario (un titolare che scrive di nuovo
    // su un ticket già "in_lavorazione" non lo retrocede).
    const nextStatus: SupportTicketStatus | null =
      ticket.status === "risolta" || ticket.status === "chiusa"
        ? "in_attesa"
        : isStaffAuthor && ticket.status === "in_attesa"
          ? "in_lavorazione"
          : null;
    await tx.supportTicket.update({
      where: { id: ticketId },
      data: nextStatus ? { status: nextStatus } : {},
    });

    // Destinatario del fan-out: sempre "l'altra parte" rispetto a chi
    // scrive, mai l'autore del messaggio stesso.
    if (isStaffAuthor) {
      if (ticket.userId !== authorId) {
        await createNotification(tx, {
          userId: ticket.userId,
          type: NotificationType.support_reply,
          entityId: ticketId,
        });
      }
    } else {
      const staffIds = await listSupportStaffUserIds(tx, authorId);
      await createNotifications(
        tx,
        staffIds.map(staffId => ({
          userId: staffId,
          type: NotificationType.support_reply,
          entityId: ticketId,
        }))
      );
    }

    return message;
  });
}

// Solo cambio stato (staff): usata per marcare manualmente
// "risolta"/"chiusa"/"in_lavorazione" senza scrivere un messaggio.
export async function updateSupportTicketStatus(
  prisma: PrismaClient,
  ticketId: number,
  status: SupportTicketStatus
): Promise<SupportTicket> {
  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status },
  });
}

// Cancellazione definitiva (staff): i messaggi cascadano via `onDelete:
// Cascade` (schema.prisma), nessuna pulizia applicativa aggiuntiva qui.
export async function deleteSupportTicket(
  prisma: PrismaClient,
  ticketId: number
): Promise<void> {
  await prisma.supportTicket.delete({ where: { id: ticketId } });
}
