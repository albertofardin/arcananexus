import type { Prisma, PrismaClient } from "@prisma/client";
import type { EventStatusFilter } from "@/lib/validations/event";

export type { EventStatusFilter };

export interface ListEventsOptions {
  orgSlug?: string;
  campaignSlug?: string;
  // Eventi dell'associazione, senza campagna (campaignId nullo). Ha
  // precedenza su campaignSlug se entrambi sono passati.
  noCampaign?: boolean;
  startDate?: Date;
  endDate?: Date;
  myBookingsUserId?: string;
  status?: EventStatusFilter;
  page: number;
  pageSize: number;
  // Di default `"desc"` (retrocompatibile con ogni chiamante esistente:
  // catalogo eventi paginato, missive/downtime). Il widget "Prossimi eventi"
  // (dashboard/page.tsx) passa `"asc"` insieme a `startDate: oggi`: con
  // `desc` e un `pageSize` inferiore al numero di eventi futuri pubblicati,
  // il `take` avrebbe selezionato i N eventi più *lontani* nel tempo invece
  // dei più imminenti.
  sortDirection?: "asc" | "desc";
  // Di default sono visibili solo gli eventi non nascosti (`visibility: "visible"`).
  // Le date di apertura/chiusura iscrizioni non influenzano la visibilità, solo
  // la possibilità di iscriversi. Chi gestisce eventi vede anche quelli nascosti:
  // tutti (`includeAllUnpublished`, direttivo/sviluppo) oppure solo quelli
  // delle campagne di cui è master (`unpublishedCampaignIds`).
  includeAllUnpublished?: boolean;
  unpublishedCampaignIds?: number[];
}

export async function listPublishedEvents(
  prisma: PrismaClient,
  options: ListEventsOptions
) {
  const {
    orgSlug,
    campaignSlug,
    noCampaign,
    startDate,
    endDate,
    myBookingsUserId,
    status,
    page,
    pageSize,
    sortDirection = "desc",
    includeAllUnpublished,
    unpublishedCampaignIds,
  } = options;
  const now = new Date();

  const where: Prisma.EventWhereInput = {
    ...(orgSlug && { organization: { slug: orgSlug } }),
    ...(noCampaign
      ? { campaignId: null }
      : campaignSlug && { campaign: { slug: campaignSlug } }),
  };
  if (!includeAllUnpublished) {
    where.OR = [
      { visibility: "visible" },
      ...(unpublishedCampaignIds?.length
        ? [{ campaignId: { in: unpublishedCampaignIds } }]
        : []),
    ];
  }

  // Lo status è calcolato dalle stesse date mostrate a schermo (vedi
  // getEventStatus): "past" è dateEventStart < now; "open"/"closed"/"upcoming"
  // richiedono dateEventStart >= now e si distinguono sulla finestra di
  // pubblicazione (datePublicationStart/End).
  const eventDateFilter: Prisma.DateTimeFilter = {};
  if (startDate) eventDateFilter.gte = startDate;
  if (endDate) eventDateFilter.lte = endDate;

  if (status === "past") {
    eventDateFilter.lt = now;
  } else if (
    status === "open" ||
    status === "closed" ||
    status === "upcoming"
  ) {
    if (!eventDateFilter.gte || eventDateFilter.gte < now) {
      eventDateFilter.gte = now;
    }
    if (status === "open") {
      where.datePublicationStart = { lte: now };
      where.datePublicationEnd = { gte: now };
    } else if (status === "closed") {
      where.datePublicationEnd = { lt: now };
    } else {
      where.datePublicationStart = { gt: now };
    }
  }

  if (Object.keys(eventDateFilter).length > 0) {
    where.dateEventStart = eventDateFilter;
  }

  if (myBookingsUserId) {
    where.bookings = { some: { userId: myBookingsUserId } };
  }

  const skip = (page - 1) * pageSize;

  const [events, totalCount] = await Promise.all([
    prisma.event.findMany({
      where,
      include: {
        campaign: {
          select: { name: true, slug: true, color: true, logo: true },
        },
        _count: { select: { bookings: true } },
      },
      orderBy: { dateEventStart: sortDirection },
      skip,
      take: pageSize,
    }),
    prisma.event.count({ where }),
  ]);

  return { events, totalCount };
}

// Il "prossimo evento" pubblicato di una campagna (bacheca home, T-0xx): a
// differenza di `listPublishedEvents` (lista paginata per `/api/events`,
// dove serve il totale per la paginazione) qui serve un solo record, il più
// vicino nel tempo — `orderBy dateEventStart asc, take 1` a livello DB invece di
// scaricare fino a `pageSize` righe con relazioni e riordinarle in JS. Oltre
// al costo, l'ordinamento `desc` usato da `listPublishedEvents` avrebbe
// potuto restituire l'evento più *lontano* tra i primi `pageSize`, non il
// più vicino, su una campagna con più eventi pubblicati futuri di
// `pageSize`.
export async function getNextPublishedEvent(
  prisma: PrismaClient,
  options: { orgSlug?: string; campaignSlug?: string; startDate: Date }
) {
  const { orgSlug, campaignSlug, startDate } = options;

  return prisma.event.findFirst({
    where: {
      ...(orgSlug && { organization: { slug: orgSlug } }),
      ...(campaignSlug && { campaign: { slug: campaignSlug } }),
      visibility: "visible",
      dateEventStart: { gte: startDate },
    },
    include: {
      campaign: { select: { name: true, slug: true } },
      _count: { select: { bookings: true } },
    },
    orderBy: { dateEventStart: "asc" },
  });
}

// L'evento "corrente" di una campagna per il master (admin/progress,
// T-0xx): a differenza di `getNextPublishedEvent` NON filtra su
// `datePublicationStart` — il master deve poter raggiungere anche un evento
// ancora in bozza/non pubblicato dal proprio pannello, prima che sia
// visibile ai giocatori. Preferisce il prossimo evento futuro (`dateEventStart`
// più vicino); se la campagna non ne ha uno, ripiega sull'ultimo evento
// passato così il master vede comunque qualcosa da riaprire/consultare
// invece di un vuoto silenzioso.
export async function getCurrentEventForCampaign(
  prisma: PrismaClient,
  campaignId: number,
  now: Date
) {
  const upcoming = await prisma.event.findFirst({
    where: { campaignId, dateEventStart: { gte: now } },
    orderBy: { dateEventStart: "asc" },
    select: { id: true, name: true, dateEventStart: true },
  });
  if (upcoming) return upcoming;

  return prisma.event.findFirst({
    where: { campaignId },
    orderBy: { dateEventStart: "desc" },
    select: { id: true, name: true, dateEventStart: true },
  });
}

export async function getEventByIdScoped(
  prisma: PrismaClient,
  eventId: number,
  orgSlug: string
) {
  return prisma.event.findUnique({
    where: {
      id: eventId,
      organization: { slug: orgSlug },
    },
    include: {
      campaign: {
        select: { id: true, name: true, slug: true, color: true, logo: true },
      },
      _count: { select: { bookings: true } },
      socials: true,
      paymentOptions: true,
    },
  });
}

export async function getEventMetadataByIdScoped(
  prisma: PrismaClient,
  eventId: number,
  orgSlug: string
) {
  return prisma.event.findUnique({
    where: {
      id: eventId,
      organization: { slug: orgSlug },
    },
    select: {
      name: true,
      description: true,
      image: true,
    },
  });
}

export interface EventWriteData {
  name: string;
  image?: string | null;
  place: string;
  description: string;
  dateEventStart: Date;
  dateEventEnd: Date;
  datePublicationStart: Date;
  datePublicationEnd: Date;
  price: number;
  visibility: "visible" | "hidden";
  paymentOptions: { label: string; amount: number }[];
}

export async function createEvent(
  prisma: PrismaClient,
  data: EventWriteData & { organizationId: number; campaignId: number | null }
) {
  const { paymentOptions, ...event } = data;
  return prisma.event.create({
    data: { ...event, paymentOptions: { create: paymentOptions } },
  });
}

// `organizationId` nel where: un id di un altro tenant risulta "non trovato"
// invece di essere modificato (P2025 → il chiamante risponde 404).
export async function updateEvent(
  prisma: PrismaClient,
  eventId: number,
  organizationId: number,
  data: EventWriteData & { campaignId: number | null }
) {
  const { paymentOptions, ...event } = data;
  return prisma.event.update({
    where: { id: eventId, organizationId },
    data: {
      ...event,
      // Sostituzione completa della lista: più semplice di un diff riga per
      // riga e coerente col fatto che il form invia sempre l'elenco intero.
      paymentOptions: { deleteMany: {}, create: paymentOptions },
    },
  });
}

export async function deleteEvent(
  prisma: PrismaClient,
  eventId: number,
  organizationId: number
) {
  return prisma.event.delete({ where: { id: eventId, organizationId } });
}

// Iscrizioni con pagamento: se ce n'è anche una sola l'evento non è più
// eliminabile (solo nascondibile).
export async function countPaidBookings(prisma: PrismaClient, eventId: number) {
  return prisma.booking.count({
    where: { eventId, paymentId: { not: null } },
  });
}
