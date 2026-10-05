import { NotificationType, type PrismaClient } from "@prisma/client";
import type { PrismaTransactionClient } from "./types";
import { createNotification } from "./notification.repository";

// Saldo buoni (vedi il model `Voucher` in `schema.prisma`): somma dei
// movimenti dell'anno associativo indicato, arrotondata ai centesimi.
export async function getVoucherBalance(
  prisma: PrismaTransactionClient,
  userId: string,
  year: number
): Promise<number> {
  const result = await prisma.voucher.aggregate({
    where: { userId, year },
    _sum: { amount: true },
  });
  return Math.round(Number(result._sum.amount ?? 0) * 100) / 100;
}

// Quanto del prezzo coprono i buoni: mai più del saldo, mai più del prezzo.
export const voucherCoverage = (price: number, balance: number) =>
  Math.max(0, Math.min(price, balance));

export class InsufficientVoucherBalanceError extends Error {
  constructor() {
    super("Saldo buoni insufficiente");
  }
}

// Utilizzo del saldo: va eseguito DENTRO la transazione (serializzabile) di
// chi registra il pagamento, così due utilizzi concorrenti non possono
// portare il saldo sotto zero.
export async function spendVoucher(
  tx: PrismaTransactionClient,
  data: { userId: string; year: number; amount: number; eventId: number }
) {
  const balance = await getVoucherBalance(tx, data.userId, data.year);
  if (data.amount > balance + 0.001)
    throw new InsufficientVoucherBalanceError();
  return tx.voucher.create({
    data: {
      userId: data.userId,
      year: data.year,
      amount: -data.amount,
      reason: "payment",
      eventId: data.eventId,
    },
  });
}

// Buono creato dal direttivo: accredito + notifica (pannello, push, email).
// Niente transazione: il fan-out email rilegge il buono con il client
// singleton, quindi deve essere già committato quando parte la notifica.
export async function createVoucherGrant(
  prisma: PrismaClient,
  data: { userId: string; year: number; amount: number; createdById: string }
) {
  const voucher = await prisma.voucher.create({
    data: { ...data, reason: "grant" },
  });
  await createNotification(prisma, {
    userId: data.userId,
    type: NotificationType.voucher,
    entityId: voucher.id,
  });
  return voucher;
}

// Quanto viene rimborsato in buoni disiscrivendosi: la quota intera pagata
// (anche la parte coperta da buoni); nulla se iscritto gratis dallo staff.
export const bookingRefund = (booking: {
  addedByStaff: boolean;
  payment: { value: unknown } | null;
}) => (booking.addedByStaff ? 0 : Number(booking.payment?.value ?? 0));

// Disiscrizione da un evento: cancella l'iscrizione e, se era pagata,
// rimborsa l'intera quota in buoni. Il `Payment` resta come traccia.
export async function cancelBookingWithRefund(
  prisma: PrismaClient,
  data: {
    bookingId: number;
    userId: string;
    eventId: number;
    year: number;
    refund: number;
  }
) {
  return prisma.$transaction(async tx => {
    const { count } = await tx.booking.deleteMany({
      where: { id: data.bookingId, userId: data.userId },
    });
    if (count === 0 || data.refund <= 0) return;
    await tx.voucher.create({
      data: {
        userId: data.userId,
        year: data.year,
        amount: data.refund,
        reason: "refund",
        eventId: data.eventId,
      },
    });
  });
}
