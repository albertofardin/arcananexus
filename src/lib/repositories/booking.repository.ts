import { Prisma, type PrismaClient } from "@prisma/client";
import { spendVoucher } from "./voucher.repository";

export async function getBookingForUser(
  prisma: PrismaClient,
  eventId: number,
  userId: string
) {
  return prisma.booking.findUnique({
    where: { eventId_userId: { eventId, userId } },
    include: {
      character: { select: { id: true, name: true } },
      payment: { select: { value: true } },
    },
  });
}

// Lista iscritti per la pagina master e l'export CSV: l'autorizzazione è
// responsabilità del chiamante (`canManageEvents`).
export async function listEventBookings(prisma: PrismaClient, eventId: number) {
  return prisma.booking.findMany({
    where: { eventId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          PersonalData: { select: { firstName: true, lastName: true } },
        },
      },
      character: { select: { id: true, name: true, avatar: true } },
      payment: { select: { value: true } },
    },
    orderBy: { bookingDate: "asc" },
  });
}

export type EventBookingRow = Awaited<
  ReturnType<typeof listEventBookings>
>[number];

export async function createFreeBooking(
  prisma: PrismaClient,
  data: {
    eventId: number;
    userId: string;
    characterId?: number | null;
    addedByStaff?: boolean;
    note?: string | null;
    paymentOptionLabel?: string | null;
  }
) {
  return prisma.booking.create({
    data: {
      eventId: data.eventId,
      userId: data.userId,
      characterId: data.characterId ?? null,
      addedByStaff: data.addedByStaff ?? false,
      note: data.note || null,
      paymentOptionLabel: data.paymentOptionLabel ?? null,
      price: 0,
    },
  });
}

// Pagamento + iscrizione nella stessa transazione: o entrambi o nessuno.
// `value` è sempre la quota intera (export CSV invariato); `voucher` è la
// parte coperta dal saldo buoni, scalata nella stessa transazione
// (serializzabile, così il saldo non va mai sotto zero).
export async function createPaidBooking(
  prisma: PrismaClient,
  data: {
    eventId: number;
    userId: string;
    characterId?: number | null;
    value: number;
    paymentData: Prisma.InputJsonValue;
    note?: string | null;
    paymentOptionLabel?: string | null;
    voucher?: { amount: number; year: number };
  }
) {
  const { voucher } = data;
  return prisma.$transaction(
    async tx => {
      if (voucher && voucher.amount > 0) {
        await spendVoucher(tx, {
          userId: data.userId,
          year: voucher.year,
          amount: voucher.amount,
          eventId: data.eventId,
        });
      }
      const payment = await tx.payment.create({
        data: {
          userId: data.userId,
          value: data.value,
          paymentData: data.paymentData,
        },
      });
      return tx.booking.create({
        data: {
          eventId: data.eventId,
          userId: data.userId,
          characterId: data.characterId ?? null,
          paymentId: payment.id,
          paymentDate: new Date(),
          price: Math.round(data.value),
          note: data.note || null,
          paymentOptionLabel: data.paymentOptionLabel ?? null,
        },
      });
    },
    voucher && voucher.amount > 0
      ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      : undefined
  );
}

// Pagamenti eventi dell'utente nell'anno associativo indicato (Tesseramento
// e pagamenti, T-051): solo iscrizioni pagate, con evento e pagamento, così
// nessuno può dire "non so se ho pagato" o contestare un addebito.
export async function listUserPaidBookingsForYear(
  prisma: PrismaClient,
  userId: string,
  year: number
) {
  return prisma.booking.findMany({
    where: {
      userId,
      paymentId: { not: null },
      event: {
        dateEventStart: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
      },
    },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          dateEventStart: true,
          campaign: { select: { name: true } },
        },
      },
      payment: {
        select: { id: true, value: true, paymentData: true, createdAt: true },
      },
    },
    orderBy: { payment: { createdAt: "desc" } },
  });
}

export type UserPaidBookingRow = Awaited<
  ReturnType<typeof listUserPaidBookingsForYear>
>[number];

// Idempotenza del ritorno da PayPal: lo stesso ordine non registra due volte.
export async function findPaymentByPayPalOrderId(
  prisma: PrismaClient,
  orderId: string
) {
  return prisma.payment.findFirst({
    where: { paymentData: { path: ["orderId"], equals: orderId } },
  });
}
