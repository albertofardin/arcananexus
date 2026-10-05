import type { Prisma, PrismaClient } from "@prisma/client";

export async function getUserMembershipsWithPayments(
  prisma: PrismaClient,
  userId: string
) {
  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    }),
    prisma.membership.findMany({
      where: { userId },
      orderBy: { year: "desc" },
    }),
  ]);

  if (!user) return null;

  const paymentIds = memberships.map(m => m.paymentId);
  const payments = paymentIds.length
    ? await prisma.payment.findMany({ where: { id: { in: paymentIds } } })
    : [];
  const paymentMap = new Map(payments.map(p => [p.id, p]));

  return { user, memberships, paymentMap };
}

// Pagamento + tessera nella stessa transazione: o entrambi o nessuno.
// Mirror di `createPaidBooking` in `booking.repository.ts`.
export async function createPaidMembership(
  prisma: PrismaClient,
  data: {
    userId: string;
    year: number;
    value: number;
    paymentData: Prisma.InputJsonValue;
  }
) {
  return prisma.$transaction(async tx => {
    const payment = await tx.payment.create({
      data: {
        userId: data.userId,
        value: data.value,
        paymentData: data.paymentData,
      },
    });
    return tx.membership.create({
      data: {
        userId: data.userId,
        year: data.year,
        startDate: new Date(Date.UTC(data.year, 0, 1)),
        endDate: new Date(Date.UTC(data.year, 11, 31, 23, 59, 59)),
        paymentId: payment.id,
      },
    });
  });
}

// Tesserati dell'anno indicato (select "Crea buono" del direttivo).
export async function listMembersForYear(prisma: PrismaClient, year: number) {
  return prisma.user.findMany({
    where: { Membership: { some: { year } } },
    select: {
      id: true,
      name: true,
      image: true,
      PersonalData: { select: { firstName: true, lastName: true } },
    },
    orderBy: { name: "asc" },
  });
}
