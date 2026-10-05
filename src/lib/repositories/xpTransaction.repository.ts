import { Prisma, type XpReason, type XpTransaction } from "@prisma/client";
import type { PrismaTransactionClient } from "./types";

export type XpTransactionWithReferenceData = Prisma.XpTransactionGetPayload<{
  include: {
    referenceData: { select: { name: true } };
    updatedBy: { select: { name: true } };
  };
}>;

export interface CreateXpTransactionInput {
  characterId: number;
  amount: number;
  reason: XpReason;
  referenceDataId?: number | null;
  actionId?: number | null;
  sourceCharacterId?: number | null;
  updatedById?: string | null;
  note?: string | null;
}

export async function createXpTransaction(
  prisma: PrismaTransactionClient,
  data: CreateXpTransactionInput
): Promise<XpTransaction> {
  return prisma.xpTransaction.create({ data });
}

// Grant iniziale già registrato per il PG (idempotenza di `grantInitialXp`).
export async function findInitialGrant(
  prisma: PrismaTransactionClient,
  characterId: number
): Promise<XpTransaction | null> {
  return prisma.xpTransaction.findFirst({
    where: { characterId, reason: "initialGrant" },
  });
}

// Somma di TUTTE le transazioni XP del personaggio (importi positivi e
// negativi): è il saldo netto attualmente spendibile. Ogni `Action` ha
// sempre effetto immediato, quindi non c'è più alcuna distinzione fra
// "saldo effettivo" e importi in sospeso.
export async function getSettledXpSum(
  prisma: PrismaTransactionClient,
  characterId: number
): Promise<number> {
  const result = await prisma.xpTransaction.aggregate({
    where: { characterId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

// Somma dei soli importi POSITIVI (grant iniziale, avanzamento, refund,
// recupero XP alla morte, aggiustamenti positivi del master): è l'XP
// accumulato nel corso della vita del personaggio, senza sottrarre quanto
// speso in acquisti (importi negativi) — a differenza del saldo netto
// (`getSettledXpSum`). Usata solo per la card "Accumulati" di
// `ModalXpHistory`, mai per calcoli di budget (quelli usano sempre il saldo
// netto).
export async function getEarnedXpSum(
  prisma: PrismaTransactionClient,
  characterId: number
): Promise<number> {
  const result = await prisma.xpTransaction.aggregate({
    where: { characterId, amount: { gt: 0 } },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

// `take` opzionale (T-0xx): la scheda personaggio (`characterEditor.service`)
// passa un limite esplicito per non scaricare l'intera cronologia XP di
// personaggi vecchi ad ogni caricamento — omesso, il comportamento resta
// "tutte le transazioni" (retrocompatibile con i chiamanti esistenti).
export async function listXpTransactionsForCharacter(
  prisma: PrismaTransactionClient,
  characterId: number,
  take?: number
): Promise<XpTransactionWithReferenceData[]> {
  return prisma.xpTransaction.findMany({
    where: { characterId },
    orderBy: { createdAt: "desc" },
    include: {
      referenceData: { select: { name: true } },
      updatedBy: { select: { name: true } },
    },
    ...(take !== undefined ? { take } : {}),
  });
}
