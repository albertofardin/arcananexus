import {
  NotificationType,
  type CampaignColor,
  type CharacterType,
  type Notification,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import type { PrismaTransactionClient } from "./types";
import { listSubscriptionsForUser } from "./pushSubscription.repository";
import {
  MISSIVE_COMMUN_TEXT,
  MISSIVE_MASTER_TEXT,
} from "@/lib/validations/missive";
import type { DowntimeStatus } from "@/lib/downtime/status";
import {
  getCharacterStatus,
  type CharacterStatus,
} from "@/components/BadgeCharacterStatus/status";
import { routes } from "@/app/routes";
import { prisma as appPrisma } from "@/lib/db";
import { sendPush, isPushConfigured, type PushPayload } from "@/lib/webpush";
import { getAppBaseUrl } from "@/lib/appUrl";
import formatCurrency from "@/lib/utils/formatCurrency";
import { isEmailConfigured } from "@/lib/email/client";
import * as emailFlags from "@/lib/email/emailFlags";
import {
  sendNotificationEmail,
  campaignColorHex,
} from "@/lib/email/notificationEmail";

// Lette da `actionData.status`/`actionData.response` (salvate da
// `updateDowntimeStatus` in `downtime.repository.ts`), duplicate qui per lo
// STESSO motivo dei discriminanti missive sopra: `downtime.repository.ts` ha
// già iniziato a importare `createNotification` da QUESTO modulo (per
// notificare l'autore quando il master cambia stato) — un import reale in
// senso opposto chiuderebbe un ciclo. Due one-liner senza logica di dominio,
// stesso principio di `resolveDowntimeStatus`/`resolveDowntimeResponse` in
// `downtime.repository.ts`: rischio di disallineamento marginale.
function resolveDowntimeStatus(actionData: Prisma.JsonValue): DowntimeStatus {
  const value = (actionData as { status?: DowntimeStatus } | null)?.status;
  return value ?? "waiting";
}

function resolveDowntimeResponse(actionData: Prisma.JsonValue): string | null {
  const value = (actionData as { response?: string | null } | null)?.response;
  return value ? value : null;
}

// Letta da `actionData.category` (T-0xx, fix catalogo globale: le categorie
// downtime non sono più una `FeatureType`/`Feature` dedicata — vedi
// `handlers/downtimeAction.ts` — quindi `action.feature.featureType.featureName`
// risolverebbe sempre al nome statico del contenitore, "Downtime", mai alla
// categoria scelta dal giocatore), stesso principio di duplicazione di
// `resolveDowntimeStatus`/`resolveDowntimeResponse` sopra.
function resolveDowntimeCategory(actionData: Prisma.JsonValue): string {
  return (actionData as { category?: string } | null)?.category ?? "";
}

// Discriminanti su `actionData` grezzo duplicate deliberatamente da
// `handlers/missive.ts`/`missive.repository.ts` (che espongono le stesse
// identiche funzioni, `isCommunicationMissive`/`isFreeReceiverMissive`/
// `isMasterTargetedReply`/un `resolveThreadRootId` privato), NON importate
// da lì: `downtimeAction.ts` importa questo modulo per il fan-out
// `notifyUserIds` (T-0xx), e `handlers/missive.ts` importa a sua volta
// `downtimeActionSchema` da `downtimeAction.ts` con un `.extend()` a livello
// di modulo (non dentro una funzione) — un import reale (non solo di tipi)
// di questo modulo verso `handlers/missive.ts` chiuderebbe un ciclo
// `downtimeAction.ts -> notification.repository.ts -> handlers/missive.ts
// -> downtimeAction.ts` che rompe l'inizializzazione di `downtimeActionSchema`
// (una `const`, non hoistata come le funzioni `export function` che invece
// permettono il ciclo deliberato fra `missive.ts`/`missive.repository.ts`,
// vedi i commenti lì) — verificato empiricamente (`TypeError: Cannot read
// properties of undefined (reading 'extend')` in test reali). Tre one-liner
// senza logica di dominio: il rischio di disallineamento è marginale rispetto
// al rischio di un ciclo di import fragile.
function isCommunicationMissive(data: unknown): boolean {
  return (
    !!data &&
    typeof data === "object" &&
    (data as Record<string, unknown>).communication === true
  );
}

function isFreeReceiverMissive(data: unknown): boolean {
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>).receiverFreeText === "string"
  );
}

function isMasterTargetedReply(data: unknown): boolean {
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>).receiverUserId === "string"
  );
}

function resolveThreadRootId(actionData: unknown): number | null {
  const value = (actionData as { threadRootId?: number } | null)?.threadRootId;
  return typeof value === "number" ? value : null;
}

// Pannello notifiche stile Facebook (T-0xx, FASE 1 backend): tabella
// dedicata (`Notification`, vedi `schema.prisma`), niente calcolo al volo —
// serve soprattutto per il downtime, che non ha alcun concetto di "letto".

// `campaignId` assente/`null` SOLO per `support_new`/`support_reply`
// (T-0xx, "Supporto"): l'unico caso non campaign-scoped fra i cinque
// `NotificationType` — ogni altro chiamante continua a passarlo sempre
// (invariante applicata dai chiamanti, non dal tipo).
export interface CreateNotificationInput {
  userId: string;
  campaignId?: number;
  type: NotificationType;
  entityId: number;
}

// Testo/URL generici per il push (T-0xx, notifiche push mobile): niente
// arricchimento (nome mittente, oggetto...) come in `listNotificationsForUser`
// — costerebbe query aggiuntive dentro un fan-out fire-and-forget, mentre
// aprendo la push l'utente arriva comunque sulla pagina giusta con tutto il
// dettaglio reale.
const PUSH_COPY: Record<NotificationType, { title: string; body: string }> = {
  missive: { title: "Nuova missiva", body: "Hai ricevuto una nuova missiva" },
  character_status: {
    title: "Revisione personaggio",
    body: "C'è un aggiornamento su un personaggio",
  },
  downtime: {
    title: "Downtime",
    body: "C'è un aggiornamento su una downtime",
  },
  support_new: {
    title: "Supporto",
    body: "È stata aperta una nuova segnalazione di supporto",
  },
  support_reply: {
    title: "Supporto",
    body: "Hai una risposta alla tua segnalazione di supporto",
  },
  event_booking: {
    title: "Iscrizione evento",
    body: "Sei stato iscritto a un evento",
  },
  voucher: {
    title: "Nuovo buono",
    body: "Hai ricevuto un buono da usare per gli eventi",
  },
};

function resolvePushUrl(
  type: NotificationType,
  entityId: number,
  campaignSlug: string | null
): string {
  if (
    type === NotificationType.support_new ||
    type === NotificationType.support_reply
  ) {
    return routes.profileSupportTicket(entityId);
  }
  if (type === NotificationType.event_booking) {
    return routes.event(campaignSlug, entityId);
  }
  if (type === NotificationType.voucher) return routes.profileMembership();
  if (!campaignSlug) return routes.home();
  if (type === NotificationType.missive) {
    return routes.campaignMissiveDetail(campaignSlug, entityId);
  }
  if (type === NotificationType.character_status) {
    return routes.campaignCharacter(campaignSlug, entityId);
  }
  return routes.campaignDowntimeDetail(campaignSlug, entityId);
}

// Fan-out Web Push (T-0xx): SEMPRE fire-and-forget dopo l'insert, mai
// dentro la transazione del chiamante (`createNotification`/
// `createNotifications` girano dentro la tx di chi le chiama, vedi i loro
// commenti) — per questo usa `appPrisma`, il client singleton, non il
// `PrismaTransactionClient` ricevuto: una chiamata di rete verso il push
// service non deve mai tenere occupata la connessione/i lock della
// transazione del chiamante. `isPushConfigured()` in testa rende l'intera
// funzione un no-op a costo zero quando il progetto non ha VAPID configurato
// (checkout locale, test — che non caricano il vero `.env`).
//
// ponytail: `unreadCount` può correre in leggero anticipo sul commit della
// transazione del chiamante (sottostima di un'unità sul badge). Il poll
// client di 30s (`useNotifications`) si auto-corregge al giro successivo —
// non vale un pattern outbox/after-commit solo per un badge cosmetico.
async function notifyPush(input: CreateNotificationInput): Promise<void> {
  if (!isPushConfigured()) return;

  try {
    const subscriptions = await listSubscriptionsForUser(
      appPrisma,
      input.userId
    );
    if (subscriptions.length === 0) return;

    const [unreadCount, campaign] = await Promise.all([
      countUnreadNotifications(appPrisma, input.userId),
      input.campaignId != null
        ? appPrisma.campaign.findUnique({
            where: { id: input.campaignId },
            select: { slug: true },
          })
        : Promise.resolve(null),
    ]);

    const payload: PushPayload = {
      ...PUSH_COPY[input.type],
      url: resolvePushUrl(input.type, input.entityId, campaign?.slug ?? null),
      tag: `${input.type}-${input.entityId}`,
      unreadCount,
    };

    await Promise.all(
      subscriptions.map(sub => sendPush(appPrisma, sub, payload))
    );
  } catch (error) {
    console.error("Push fan-out failed:", error);
  }
}

// Frasi email per un cambio stato downtime/PG (T-0xx): stesso testo di
// `DOWNTIME_STATUS_PHRASE`/`CHARACTER_STATUS_PHRASE` in `BtnNotifications.tsx`,
// duplicate qui perché quel file è un componente client ("use client") — un
// import reale da un modulo server-side come questo non ha senso
// architetturalmente, stesso principio delle altre duplicazioni deliberate
// in questo file (vedi `resolveDowntimeStatus` sopra).
const EMAIL_DOWNTIME_STATUS_PHRASE: Record<DowntimeStatus, string> = {
  waiting: "creata",
  approve: "approvata",
  refuse: "rifiutata",
};

const EMAIL_CHARACTER_STATUS_PHRASE: Record<CharacterStatus, string> = {
  approved: "approvato",
  parked: "parcheggiato",
  dead: "dichiarato deceduto",
  review: "rimesso in revisione",
};

interface EmailNotificationContent {
  subject: string;
  heading: string;
  ctaLabel: string;
}

// Testo email arricchito per UNA notifica (T-0xx): a differenza di
// `PUSH_COPY` (statico, un payload minimo per tipo) qui serve il nome della
// campagna/personaggio/mittente nel corpo del messaggio — risolve quindi
// l'entità referenziata (`entityId`) con query mirate per tipo, invece di
// riusare `listNotificationsForUser` (pensata per arricchire un batch di
// righe già esistenti, non per una singola notifica appena creata).
async function buildEmailContent(
  input: CreateNotificationInput,
  campaignName: string | null
): Promise<EmailNotificationContent | null> {
  if (
    input.type === NotificationType.support_new ||
    input.type === NotificationType.support_reply
  ) {
    const ticket = await appPrisma.supportTicket.findUnique({
      where: { id: input.entityId },
      select: {
        subject: true,
        user: { select: { name: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { author: { select: { name: true } } },
        },
      },
    });
    if (!ticket) return null;

    const authorName =
      input.type === NotificationType.support_new
        ? ticket.user.name
        : (ticket.messages[0]?.author.name ?? ticket.user.name);

    return {
      subject: "Supporto — Arcana Domine",
      heading:
        input.type === NotificationType.support_new
          ? `${authorName} ha aperto una nuova segnalazione di supporto: "${ticket.subject}"`
          : `${authorName} ha risposto alla tua segnalazione di supporto: "${ticket.subject}"`,
      ctaLabel: "Vai alla segnalazione",
    };
  }

  if (input.type === NotificationType.event_booking) {
    const event = await appPrisma.event.findUnique({
      where: { id: input.entityId },
      select: { name: true },
    });
    if (!event) return null;
    return {
      subject: `Iscrizione a ${event.name}`,
      heading: campaignName
        ? `In ${campaignName} lo staff ti ha iscritto gratuitamente all'evento "${event.name}"`
        : `Lo staff ti ha iscritto gratuitamente all'evento "${event.name}"`,
      ctaLabel: "Vai all'evento",
    };
  }

  if (input.type === NotificationType.voucher) {
    const voucher = await appPrisma.voucher.findUnique({
      where: { id: input.entityId },
      select: { amount: true },
    });
    if (!voucher) return null;
    return {
      subject: "Hai ricevuto un buono — Arcana Domine",
      heading: `Hai ricevuto un buono di ${formatCurrency(voucher.amount.toString())}: verrà scalato automaticamente dalla quota della tua prossima iscrizione a un evento. Il saldo buoni vale fino alla scadenza della tessera associativa in corso.`,
      ctaLabel: "Vedi il tuo saldo buoni",
    };
  }

  // Invariante di `CreateNotificationInput`: `campaignId` (e quindi
  // `campaignName`) è sempre presente per gli altri tre tipi.
  if (!campaignName) return null;

  if (input.type === NotificationType.missive) {
    const action = await appPrisma.action.findUnique({
      where: { id: input.entityId },
      include: { character: { select: { name: true } } },
    });
    if (!action) return null;

    const isCommunication = isCommunicationMissive(action.actionData);
    const isMasterReceiver = isMasterTargetedReply(action.actionData);
    const isReply = resolveThreadRootId(action.actionData) !== null;
    const senderName = action.character
      ? action.character.name
      : isCommunication
        ? MISSIVE_COMMUN_TEXT
        : MISSIVE_MASTER_TEXT;

    let heading: string;
    if (isCommunication) {
      heading = `In ${campaignName} è stata pubblicata una nuova Comunicazione: "${readSubject(action.actionData)}"`;
    } else if (isMasterReceiver || isReply) {
      heading = `In ${campaignName} hai ricevuto una risposta da ${senderName}`;
    } else {
      const receiverCharacterId = readReceiverCharacterId(action.actionData);
      const receiverCharacterName =
        receiverCharacterId !== undefined
          ? (
              await appPrisma.character.findUnique({
                where: { id: receiverCharacterId },
                select: { name: true },
              })
            )?.name
          : undefined;
      heading = receiverCharacterName
        ? `In ${campaignName} è arrivata una nuova missiva per ${receiverCharacterName}`
        : `In ${campaignName} è arrivata una nuova missiva da ${senderName}`;
    }

    return {
      subject: `Nuova missiva — ${campaignName}`,
      heading,
      ctaLabel: "Leggi la missiva",
    };
  }

  if (input.type === NotificationType.downtime) {
    const action = await appPrisma.action.findUnique({
      where: { id: input.entityId },
      include: {
        character: { select: { name: true, userId: true } },
      },
    });
    if (!action || !action.character) return null;

    const isAuthor = action.character.userId === input.userId;
    const categoryName = resolveDowntimeCategory(action.actionData);
    const heading = isAuthor
      ? `In ${campaignName} la tua downtime "${categoryName}" è stata ${EMAIL_DOWNTIME_STATUS_PHRASE[resolveDowntimeStatus(action.actionData)]}`
      : `In ${campaignName}, ${action.character.name} ha dichiarato una nuova downtime per "${categoryName}"`;

    return {
      subject: `Downtime — ${campaignName}`,
      heading,
      ctaLabel: "Vai alla downtime",
    };
  }

  // input.type === NotificationType.character_status
  const character = await appPrisma.character.findUnique({
    where: { id: input.entityId },
    select: {
      name: true,
      userId: true,
      approvalDate: true,
      parkDate: true,
      deathDate: true,
      user: { select: { name: true } },
    },
  });
  if (!character) return null;

  const isOwner = character.userId === input.userId;
  const heading = isOwner
    ? `In ${campaignName} il personaggio ${character.name} è stato ${EMAIL_CHARACTER_STATUS_PHRASE[getCharacterStatus(character)]}`
    : `In ${campaignName} c'è un nuovo personaggio di ${character.user.name} da revisionare`;

  return {
    subject: `Scheda Personaggio — ${campaignName}`,
    heading,
    ctaLabel: "Vai al personaggio",
  };
}

// Fan-out email (T-0xx): stesso principio di `notifyPush` sopra — sempre
// fire-and-forget dopo l'insert, mai dentro la transazione del chiamante, mai
// un fallimento propagato a chi ha creato la notifica. `isEmailConfigured()`/
// `emailNotificationsEnabled` in testa rendono l'intera funzione un no-op a
// costo (quasi) zero quando Brevo non è configurato (checkout locale, test)
// o l'utente ha disattivato le email dal profilo.
async function notifyEmail(input: CreateNotificationInput): Promise<void> {
  if (!isEmailConfigured()) return;
  const enabledByType: Record<NotificationType, boolean> = {
    missive: emailFlags.EMAIL_NOTIFICATION_MISSIVE,
    character_status: emailFlags.EMAIL_NOTIFICATION_CHARACTER_STATUS,
    downtime: emailFlags.EMAIL_NOTIFICATION_DOWNTIME,
    support_new: emailFlags.EMAIL_NOTIFICATION_SUPPORT,
    support_reply: emailFlags.EMAIL_NOTIFICATION_SUPPORT,
    event_booking: emailFlags.EMAIL_NOTIFICATION_EVENT_BOOKING,
    voucher: emailFlags.EMAIL_NOTIFICATION_VOUCHER,
  };
  if (!enabledByType[input.type]) return;

  try {
    const user = await appPrisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, emailNotificationsEnabled: true },
    });
    if (!user || !user.emailNotificationsEnabled) return;

    const campaign =
      input.campaignId != null
        ? await appPrisma.campaign.findUnique({
            where: { id: input.campaignId },
            select: { name: true, slug: true, logo: true, color: true },
          })
        : null;

    const content = await buildEmailContent(input, campaign?.name ?? null);
    if (!content) return;

    const origin = getAppBaseUrl();
    await sendNotificationEmail({
      to: user.email,
      subject: content.subject,
      heading: content.heading,
      ctaLabel: content.ctaLabel,
      ctaUrl: `${origin}${resolvePushUrl(input.type, input.entityId, campaign?.slug ?? null)}`,
      campaignName: campaign?.name,
      campaignLogo: campaign?.logo,
      colorHex: campaign ? campaignColorHex(campaign.color) : undefined,
    });
  } catch (error) {
    console.error("Email fan-out failed:", error);
  }
}

// Singolo insert (T-0xx): usata per gli eventi con UN solo destinatario
// (missiva diretta a un PG, risposta rivolta al master, azione downtime con
// UN destinatario). Accetta `PrismaTransactionClient` perché ogni chiamante
// la esegue DENTRO la stessa transazione della scrittura che la genera
// (`Action`/`Character`), mai come scrittura separata — stesso principio di
// `createAction`. I fan-out push/email (`notifyPush`/`notifyEmail`) partono
// SUBITO DOPO, senza essere attesi: vedi i loro commenti.
export async function createNotification(
  prisma: PrismaTransactionClient,
  data: CreateNotificationInput
): Promise<Notification> {
  const notification = await prisma.notification.create({ data });
  void notifyPush(data);
  void notifyEmail(data);
  return notification;
}

// Bulk insert per i casi di fan-out (Comunicazione a ogni PG attivo, nuovo
// PG in review a ogni master/head_master, azione downtime ai destinatari
// configurati di campagna): il chiamante deve aver già dedupato `rows` per
// `userId` (un utente con più PG attivi deve comparire una volta sola) —
// questa funzione non dedupa da sola, si limita a un `createMany`. No-op
// esplicito su un array vuoto: evita un round-trip DB inutile quando il
// fan-out non ha destinatari (es. nessun master configurato per il
// downtime).
export async function createNotifications(
  prisma: PrismaTransactionClient,
  rows: CreateNotificationInput[]
): Promise<Prisma.BatchPayload> {
  if (rows.length === 0) return { count: 0 };
  const result = await prisma.notification.createMany({ data: rows });
  for (const row of rows) {
    void notifyPush(row);
    void notifyEmail(row);
  }
  return result;
}

export async function countUnreadNotifications(
  prisma: PrismaClient,
  userId: string
): Promise<number> {
  return prisma.notification.count({ where: { userId, read: false } });
}

// Scopata sia all'id sia allo `userId` (`updateMany`, mai un `update` per id
// nudo): un id di un'altra utente non deve aggiornare nulla né far trapelare
// la sua esistenza con un errore — stesso principio di `markMissiveAsRead`.
// Ritorna `true` solo se ha davvero aggiornato una riga.
export async function markNotificationRead(
  prisma: PrismaClient,
  { id, userId }: { id: number; userId: string }
): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: { id, userId },
    data: { read: true },
  });
  return result.count > 0;
}

// "Segna tutte come lette" (T-0xx, pannello notifiche): un solo `updateMany`
// scopato a `userId`, nessun altro filtro — non serve sapere quali erano già
// lette, l'update su quelle è un no-op idempotente.
export async function markAllNotificationsRead(
  prisma: PrismaClient,
  userId: string
): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
  return result.count;
}

// "Elimina tutte" (pannello notifiche): un solo `deleteMany` scopato a
// `userId`, nessun filtro su `read` — rimuove anche le non lette, a
// differenza della pulizia automatica sotto.
export async function deleteAllNotifications(
  prisma: PrismaClient,
  userId: string
): Promise<number> {
  const result = await prisma.notification.deleteMany({
    where: { userId },
  });
  return result.count;
}

// Pulizia automatica silenziosa (T-0xx, pannello notifiche — nessuna
// infrastruttura di cron in questo progetto): le notifiche LETTE più vecchie
// di `READ_NOTIFICATION_RETENTION_DAYS` vengono cancellate opportunisticamente
// ogni volta che l'utente apre il pannello (`listNotificationsForUser` la
// invoca prima di leggere), non da un job schedulato. Mai le non lette,
// indipendentemente dall'età: l'utente deve poterle sempre vedere finché non
// le apre. Scopata a `userId`: ogni apertura del pannello pulisce solo la
// propria storia, non quella di tutti gli utenti della piattaforma.
export const READ_NOTIFICATION_RETENTION_DAYS = 100;

export async function deleteOldReadNotifications(
  prisma: PrismaClient,
  userId: string
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - READ_NOTIFICATION_RETENTION_DAYS);

  const result = await prisma.notification.deleteMany({
    where: { userId, read: true, createdAt: { lt: cutoff } },
  });
  return result.count;
}

// --- Lista arricchita (`listNotificationsForUser`) --------------------

interface NotificationBase {
  id: number;
  read: boolean;
  createdAt: Date;
}

// Solo per i tre tipi campaign-scoped (`missive`/`character_status`/
// `downtime`): `support_new`/`support_reply` (T-0xx, "Supporto") non hanno
// una campagna, vedi `SupportNotificationDetails` sotto.
interface CampaignNotificationBase extends NotificationBase {
  campaignId: number;
  campaignSlug: string;
  campaignName: string;
  campaignLogo: string | null;
  campaignColor: CampaignColor;
}

// Payload di una notifica `missive` (T-0xx): copre sia una missiva diretta
// (a un PG o "a nome del master") sia una risposta rivolta al master sia una
// Comunicazione — distinte da `isCommunication`/`isMasterReceiver`, nessun
// `NotificationType` dedicato per la Comunicazione (vedi il commento sul
// model `Notification` in `schema.prisma`). `senderName` non espone MAI
// l'identità reale di un master che scrive "a nome del master"
// (`row.character === null` senza essere una Comunicazione risolve sempre al
// testo generico `MISSIVE_MASTER_TEXT`, mai a `Action.authorUserId`) — stessa
// regola di visibilità server-side già applicata da `resolveMasterSenderName`
// in `missive.repository.ts`, qui non serve nemmeno costruire un
// `MissiveViewer` completo: il destinatario di UNA notifica missiva non è mai
// un master che debba vedere l'autore reale di un'ALTRA missiva "a nome del
// master" (quel caso è coperto solo dalla vista "Tutte le missive", non dal
// pannello notifiche).
export interface MissiveNotificationDetails {
  type: "missive";
  actionId: number;
  subject: string;
  isCommunication: boolean;
  isReply: boolean;
  isMasterReceiver: boolean;
  senderName: string;
  senderAvatar: string | null;
  // Nome del PG destinatario, popolato SOLO per una missiva diretta "normale"
  // (non Comunicazione, non risposta rivolta al master): `null` altrimenti,
  // incluso quando il `Character` destinatario non risolve più (eliminato).
  receiverCharacterName: string | null;
}

export interface CharacterReviewNotificationDetails {
  type: "character_status";
  characterId: number;
  characterName: string;
  characterAvatar: string | null;
  characterType: CharacterType;
  ownerUserName: string;
  // Stesso `NotificationType.character_status` per due eventi diversi (T-050,
  // mirror di `DowntimeNotificationDetails.isAuthor`): "nuovo PG in review" ai
  // master (`isOwner: false`) e "cambio stato" al proprietario del PG
  // (`isOwner: true`), stesso `entityId` (il `Character.id`). Il client
  // sceglie il testo giusto da questo flag, mai deducendolo da `status` da
  // solo.
  isOwner: boolean;
  status: CharacterStatus;
}

export interface DowntimeNotificationDetails {
  type: "downtime";
  actionId: number;
  characterName: string;
  characterAvatar: string | null;
  // `actionData.category` (T-0xx, fix catalogo globale): la stringa libera
  // scelta dal giocatore al momento della dichiarazione, tra quelle
  // configurate in `downtimeFeatureSchema.categories` — nessuna
  // normalizzazione qui, stesso valore grezzo mostrato altrove.
  categoryName: string;
  subject: string;
  // `true` quando IL DESTINATARIO di questa notifica è l'autore della
  // downtime (T-0xx, notifica di cambio stato) — `false` quando è invece un
  // master configurato che viene avvisato di una NUOVA downtime dichiarata
  // da qualcun altro (`downtimeAction.ts`, `notifyUserIds`). Stesso
  // `NotificationType.downtime` per entrambi gli eventi (l'entità
  // referenziata, l'`Action`, è la stessa), ma il messaggio da mostrare è
  // opposto: il client (FASE 2) usa questo flag per scegliere il testo
  // giusto, mai per dedurlo da `status`/`response` da solo.
  isAuthor: boolean;
  status: DowntimeStatus;
  response: string | null;
}

// Payload di una notifica `support_new`/`support_reply` (T-0xx, "Supporto"):
// unico caso non campaign-scoped, `entityId` risolve sempre a un
// `SupportTicket.id` (mai un `SupportMessage.id`, vedi il commento sul
// model in `schema.prisma`). `authorName` è risolto LIVE, mai denormalizzato
// (stesso principio del resto di questo file): per `support_new` è chi ha
// aperto il ticket, per `support_reply` è l'autore dell'ULTIMO messaggio del
// thread — il client sceglie il testo giusto da `type`, senza altra logica.
export interface SupportNotificationDetails {
  type: "support_new" | "support_reply";
  ticketId: number;
  subject: string;
  authorName: string;
}

// Iscrizione gratuita a un evento da parte dello staff: `entityId` =
// `Event.id`. Resta campaign-scoped (solo eventi di campagna, vedi le route
// `events/[eventId]/{players,staff}`).
export interface EventBookingNotificationDetails {
  type: "event_booking";
  eventId: number;
  eventName: string;
}

// Buono ricevuto dal direttivo: `entityId` = `Voucher.id`, nessuna campagna.
export interface VoucherNotificationDetails {
  type: "voucher";
  amount: number;
}

// Forma stabile consumata dalla FASE 2 (UI pannello notifiche): discriminata
// da `type`, arricchita con tutto il necessario per testo/icona/link senza
// che il client debba risolvere altro. Righe "orfane" (l'`Action`/
// `Character`/`SupportTicket` referenziato è stato cancellato nel frattempo)
// sono scartate in silenzio da `listNotificationsForUser`, mai propagate
// qui.
export type NotificationListItem =
  | (CampaignNotificationBase &
      (
        | MissiveNotificationDetails
        | CharacterReviewNotificationDetails
        | DowntimeNotificationDetails
        | EventBookingNotificationDetails
      ))
  | (NotificationBase & SupportNotificationDetails)
  | (NotificationBase & VoucherNotificationDetails);

export interface ListNotificationsOptions {
  userId: string;
  limit?: number;
}

const DEFAULT_LIST_LIMIT = 30;

function readSubject(actionData: Prisma.JsonValue): string {
  return (actionData as { subject?: string } | null)?.subject ?? "";
}

function readReceiverCharacterId(
  actionData: Prisma.JsonValue
): number | undefined {
  return (actionData as { receiverCharacterId?: number } | null)
    ?.receiverCharacterId;
}

// Elenco delle notifiche più recenti di un utente (T-0xx), lette e non
// lette, arricchite per tipo con una query in batch per tipo (mai N+1): le
// righe grezze (`Notification`) sono raggruppate per `type`, ogni gruppo
// risolve il proprio `entityId` con UNA query, poi tutto viene ricomposto
// nell'ordine originale (`createdAt desc`). Cross-campagna per costruzione
// (`where: { userId }`, nessun filtro `campaignId`): il pannello mostra le
// notifiche di TUTTE le campagne dell'utente.
export async function listNotificationsForUser(
  prisma: PrismaClient,
  { userId, limit = DEFAULT_LIST_LIMIT }: ListNotificationsOptions
): Promise<NotificationListItem[]> {
  // Pulizia automatica (T-0xx): vedi `deleteOldReadNotifications` sopra —
  // eseguita PRIMA della query principale così una notifica appena scaduta
  // non compare mai nella risposta di questa stessa chiamata.
  await deleteOldReadNotifications(prisma, userId);

  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  if (rows.length === 0) return [];

  const missiveIds = rows
    .filter(row => row.type === NotificationType.missive)
    .map(row => row.entityId);
  const characterReviewIds = rows
    .filter(row => row.type === NotificationType.character_status)
    .map(row => row.entityId);
  const downtimeIds = rows
    .filter(row => row.type === NotificationType.downtime)
    .map(row => row.entityId);
  const supportTicketIds = rows
    .filter(
      row =>
        row.type === NotificationType.support_new ||
        row.type === NotificationType.support_reply
    )
    .map(row => row.entityId);
  const eventIds = rows
    .filter(row => row.type === NotificationType.event_booking)
    .map(row => row.entityId);
  const voucherIds = rows
    .filter(row => row.type === NotificationType.voucher)
    .map(row => row.entityId);
  // `campaignId` è `null` per le righe `support_new`/`support_reply`
  // (T-0xx): escluse qui, risolte invece dalla query `supportTicket` sotto.
  const campaignIds = Array.from(
    new Set(
      rows
        .filter(
          (row): row is typeof row & { campaignId: number } =>
            row.campaignId != null
        )
        .map(row => row.campaignId)
    )
  );

  const [
    missiveActions,
    reviewCharacters,
    downtimeActions,
    campaigns,
    supportTickets,
    events,
    vouchers,
  ] = await Promise.all([
    missiveIds.length > 0
      ? prisma.action.findMany({
          where: { id: { in: missiveIds } },
          include: {
            character: { select: { id: true, name: true, avatar: true } },
          },
        })
      : Promise.resolve([]),
    characterReviewIds.length > 0
      ? prisma.character.findMany({
          where: { id: { in: characterReviewIds } },
          select: {
            id: true,
            name: true,
            avatar: true,
            type: true,
            userId: true,
            approvalDate: true,
            parkDate: true,
            deathDate: true,
            user: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    downtimeIds.length > 0
      ? prisma.action.findMany({
          where: { id: { in: downtimeIds } },
          include: {
            // `userId` (T-0xx): serve per calcolare `isAuthor` sotto —
            // confrontato con `row.userId` (il destinatario di QUESTA
            // notifica) per distinguere "sei tu l'autore, ti avviso di un
            // cambio stato" da "un master è stato avvisato di una nuova
            // dichiarazione".
            character: {
              select: { id: true, name: true, avatar: true, userId: true },
            },
          },
        })
      : Promise.resolve([]),
    campaignIds.length > 0
      ? prisma.campaign.findMany({
          where: { id: { in: campaignIds } },
          select: { id: true, name: true, slug: true, logo: true, color: true },
        })
      : Promise.resolve([]),
    supportTicketIds.length > 0
      ? prisma.supportTicket.findMany({
          where: { id: { in: supportTicketIds } },
          select: {
            id: true,
            subject: true,
            user: { select: { name: true } },
            // Autore dell'ULTIMO messaggio del thread (T-0xx): serve solo
            // per `support_reply` (vedi sotto), `take: 1` per riga —
            // Prisma applica questo `take`/`orderBy` annidato PER OGNI
            // `SupportTicket`, non sull'insieme di tutti i messaggi.
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { author: { select: { name: true } } },
            },
          },
        })
      : Promise.resolve([]),
    eventIds.length > 0
      ? prisma.event.findMany({
          where: { id: { in: eventIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    voucherIds.length > 0
      ? prisma.voucher.findMany({
          where: { id: { in: voucherIds } },
          select: { id: true, amount: true },
        })
      : Promise.resolve([]),
  ]);

  // Destinatario di una missiva diretta "normale" (T-0xx): un secondo lookup
  // batch, non incluso nella query sopra perché `receiverCharacterId` vive
  // dentro `actionData` (Json), non una vera FK Prisma — stesso pattern di
  // `resolveReceiver` in `missive.repository.ts`. Comunicazione e risposta
  // rivolta al master non hanno mai questa chiave, quindi non contribuiscono
  // all'insieme.
  const receiverCharacterIds = new Set<number>();
  for (const action of missiveActions) {
    if (
      isCommunicationMissive(action.actionData) ||
      isMasterTargetedReply(action.actionData)
    ) {
      continue;
    }
    const id = readReceiverCharacterId(action.actionData);
    if (id !== undefined) receiverCharacterIds.add(id);
  }
  const receiverCharacters =
    receiverCharacterIds.size > 0
      ? await prisma.character.findMany({
          where: { id: { in: Array.from(receiverCharacterIds) } },
          select: { id: true, name: true },
        })
      : [];

  const missiveActionById = new Map(missiveActions.map(a => [a.id, a]));
  const reviewCharacterById = new Map(reviewCharacters.map(c => [c.id, c]));
  const downtimeActionById = new Map(downtimeActions.map(a => [a.id, a]));
  const campaignById = new Map(campaigns.map(c => [c.id, c]));
  const supportTicketById = new Map(supportTickets.map(t => [t.id, t]));
  const eventById = new Map(events.map(e => [e.id, e]));
  const voucherById = new Map(vouchers.map(v => [v.id, v]));
  const receiverCharacterNameById = new Map(
    receiverCharacters.map(c => [c.id, c.name])
  );

  const items: NotificationListItem[] = [];

  for (const row of rows) {
    // `support_new`/`support_reply` (T-0xx) prima di tutto: nessuna
    // campagna da risolvere per questi due, a differenza dei tre tipi sotto
    // — il `continue` sulla campagna mancante qualche riga più giù li
    // scarterebbe sempre (il loro `campaignId` è sempre `null`).
    if (
      row.type === NotificationType.support_new ||
      row.type === NotificationType.support_reply
    ) {
      const ticket = supportTicketById.get(row.entityId);
      if (!ticket) continue;

      items.push({
        id: row.id,
        read: row.read,
        createdAt: row.createdAt,
        type:
          row.type === NotificationType.support_new
            ? "support_new"
            : "support_reply",
        ticketId: ticket.id,
        subject: ticket.subject,
        authorName:
          row.type === NotificationType.support_new
            ? ticket.user.name
            : (ticket.messages[0]?.author.name ?? ticket.user.name),
      });
      continue;
    }

    if (row.type === NotificationType.voucher) {
      const voucher = voucherById.get(row.entityId);
      if (!voucher) continue;
      items.push({
        id: row.id,
        read: row.read,
        createdAt: row.createdAt,
        type: "voucher",
        amount: Number(voucher.amount),
      });
      continue;
    }

    // Campagna cancellata nel frattempo (dovrebbe già essere impossibile,
    // `onDelete: Cascade` su `Notification.campaignId` la rimuoverebbe con
    // lei): scartata in silenzio, stesso trattamento delle altre righe
    // orfane sotto. `row.campaignId` è sempre non-null qui (i due tipi
    // senza campagna sono già stati gestiti/scartati sopra).
    const campaign = campaignById.get(row.campaignId as number);
    if (!campaign) continue;

    const base: CampaignNotificationBase = {
      id: row.id,
      read: row.read,
      createdAt: row.createdAt,
      campaignId: campaign.id,
      campaignSlug: campaign.slug,
      campaignName: campaign.name,
      campaignLogo: campaign.logo,
      campaignColor: campaign.color,
    };

    if (row.type === NotificationType.missive) {
      const action = missiveActionById.get(row.entityId);
      // `isFreeReceiverMissive` non dovrebbe mai comparire qui (nessuna
      // notifica viene creata per quel ramo, vedi `handlers/missive.ts`):
      // scartata comunque in silenzio se capitasse un dato incoerente, mai
      // un errore che fa fallire l'intera lista.
      if (!action || isFreeReceiverMissive(action.actionData)) continue;

      const isCommunication = isCommunicationMissive(action.actionData);
      const isMasterReceiver = isMasterTargetedReply(action.actionData);
      const receiverCharacterId =
        !isCommunication && !isMasterReceiver
          ? readReceiverCharacterId(action.actionData)
          : undefined;

      items.push({
        ...base,
        type: "missive",
        actionId: action.id,
        subject: readSubject(action.actionData),
        isCommunication,
        isReply: resolveThreadRootId(action.actionData) !== null,
        isMasterReceiver,
        senderName: action.character
          ? action.character.name
          : isCommunication
            ? MISSIVE_COMMUN_TEXT
            : MISSIVE_MASTER_TEXT,
        senderAvatar: action.character?.avatar ?? null,
        receiverCharacterName:
          receiverCharacterId !== undefined
            ? (receiverCharacterNameById.get(receiverCharacterId) ?? null)
            : null,
      });
      continue;
    }

    if (row.type === NotificationType.event_booking) {
      const event = eventById.get(row.entityId);
      if (!event) continue;

      items.push({
        ...base,
        type: "event_booking",
        eventId: event.id,
        eventName: event.name,
      });
      continue;
    }

    if (row.type === NotificationType.character_status) {
      const character = reviewCharacterById.get(row.entityId);
      if (!character) continue;

      items.push({
        ...base,
        type: "character_status",
        characterId: character.id,
        characterName: character.name,
        characterAvatar: character.avatar,
        characterType: character.type,
        ownerUserName: character.user.name,
        isOwner: character.userId === row.userId,
        status: getCharacterStatus(character),
      });
      continue;
    }

    // row.type === NotificationType.downtime
    const action = downtimeActionById.get(row.entityId);
    if (!action || !action.character) continue;

    items.push({
      ...base,
      type: "downtime",
      actionId: action.id,
      characterName: action.character.name,
      characterAvatar: action.character.avatar,
      categoryName: resolveDowntimeCategory(action.actionData),
      subject: readSubject(action.actionData),
      isAuthor: action.character.userId === row.userId,
      status: resolveDowntimeStatus(action.actionData),
      response: resolveDowntimeResponse(action.actionData),
    });
  }

  return items;
}
