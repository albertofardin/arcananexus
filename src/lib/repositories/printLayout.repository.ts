import type {
  PrintLayout,
  PrintLayoutSource,
  PrintSheet,
  Prisma,
  PrismaClient,
} from "@prisma/client";

// Layout salvati dell'Area Stampa, scopati a campagna come `Feature`: un id
// valido di un'altra campagna risolve a `null` (404, non 403).

export async function listPrintLayouts(
  prisma: PrismaClient,
  campaignId: number
): Promise<PrintLayout[]> {
  return prisma.printLayout.findMany({
    where: { campaignId },
    orderBy: { name: "asc" },
  });
}

export async function getPrintLayoutByIdScoped(
  prisma: PrismaClient,
  id: number,
  campaignId: number
): Promise<PrintLayout | null> {
  return prisma.printLayout.findUnique({ where: { id, campaignId } });
}

export interface CreatePrintLayoutInput {
  campaignId: number;
  source: PrintLayoutSource;
  name: string;
  template: Prisma.InputJsonValue;
  sheet: PrintSheet;
  sheetGap?: number;
  sheetMargin?: number;
}

export async function createPrintLayout(
  prisma: PrismaClient,
  data: CreatePrintLayoutInput
): Promise<PrintLayout> {
  return prisma.printLayout.create({ data });
}

export interface UpdatePrintLayoutInput {
  name?: string;
  template?: Prisma.InputJsonValue;
  sheet?: PrintSheet;
  sheetGap?: number;
  sheetMargin?: number;
}

export async function updatePrintLayout(
  prisma: PrismaClient,
  id: number,
  data: UpdatePrintLayoutInput
): Promise<PrintLayout> {
  return prisma.printLayout.update({ where: { id }, data });
}

export async function deletePrintLayout(
  prisma: PrismaClient,
  id: number
): Promise<PrintLayout> {
  return prisma.printLayout.delete({ where: { id } });
}
