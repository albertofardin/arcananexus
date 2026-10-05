import {
  DataTypeKind,
  DataCardinality,
  DataTypeAssignability,
  type PrismaClient,
  type DataType,
} from "@prisma/client";
import type {
  CreateDataTypeInput,
  UpdateDataTypeInput,
  PrismaTransactionClient,
} from "./types";

// Default del `DataType` "Talenti" (T-046): caso speciale, sempre presente
// esattamente una volta per campagna, nome fisso. Fonte unica riusata da
// `createCampaign` (creazione campagna), per evitare di duplicare questo
// literal in più punti che devono restare sincronizzati. Riusata anche dallo
// script one-off `prisma/backfill-talenti-datatype.ts` (rimosso dopo
// l'esecuzione una tantum sulle campagne pre-esistenti a T-046).
// `sidebarShow: true` è solo il default iniziale (visibile appena creato,
// come le altre categorie): dal round 4 è di nuovo liberamente togglabile
// dal master, nessun vincolo applicativo residuo su questo campo.
export const TALENTI_DATA_TYPE_DEFAULTS = {
  name: "Talenti",
  kind: DataTypeKind.talent,
  cardinality: DataCardinality.multi,
  assignability: DataTypeAssignability.always,
  sidebarShow: true,
  icon: "talent",
} as const;

export async function getDataTypeById(
  prisma: PrismaClient,
  id: number,
  includeReferenceData = false
): Promise<DataType | null> {
  return prisma.dataType.findUnique({
    where: { id },
    include: includeReferenceData
      ? {
          referenceData: {
            orderBy: { name: "asc" },
          },
          campaign: true,
        }
      : {
          campaign: true,
        },
  });
}

// Come `getDataTypeById`, ma con scoping esplicito su `campaignId`: usata
// dalle route per trattare come "non trovato" (404) un id valido ma di
// un'altra campagna, senza far trapelare la sua esistenza altrove (T-016).
export async function getDataTypeByIdScoped(
  prisma: PrismaClient,
  id: number,
  campaignId: number,
  includeReferenceData = false
): Promise<DataType | null> {
  return prisma.dataType.findUnique({
    where: { id, campaignId },
    include: includeReferenceData
      ? {
          referenceData: {
            orderBy: { name: "asc" },
          },
        }
      : undefined,
  });
}

export async function listDataTypes(
  prisma: PrismaClient,
  campaignId: number,
  includeCount = false
): Promise<DataType[]> {
  return prisma.dataType.findMany({
    where: { campaignId },
    orderBy: { name: "asc" },
    include: includeCount
      ? {
          _count: {
            select: { referenceData: true },
          },
        }
      : undefined,
  });
}

export async function getDataTypeByName(
  prisma: PrismaClient,
  campaignId: number,
  name: string
): Promise<DataType | null> {
  return prisma.dataType.findFirst({
    where: {
      campaignId,
      name: {
        equals: name,
        mode: "insensitive",
      },
    },
    include: {
      campaign: true,
    },
  });
}

// Accetta `PrismaClient | Prisma.TransactionClient` (T-046, come già
// `deleteDataType` sotto): `createCampaign` la chiama dentro la stessa
// `prisma.$transaction` con cui crea la campagna, per garantire che il
// DataType "Talenti" nasca atomicamente insieme ad essa (o nessuno dei due).
export async function createDataType(
  prisma: PrismaTransactionClient,
  data: CreateDataTypeInput
): Promise<DataType> {
  return prisma.dataType.create({
    data: {
      name: data.name,
      campaignId: data.campaignId,
      kind: data.kind,
      description: data.description,
      cardinality: data.cardinality,
      assignability: data.assignability,
      mandatory: data.mandatory,
      sidebarShow: data.sidebarShow,
      sidebarOrder: data.sidebarOrder,
      icon: data.icon,
      renderAs: data.renderAs,
      visibility: data.visibility,
    },
    include: {
      campaign: true,
    },
  });
}

// `kind` è aggiornabile solo se la route lo consente (guard "talent non
// cambia mai kind" + "solo su una riga senza `ReferenceData` figlie" — vedi
// `types.ts` / `validations/dataType.ts`): il repository resta un
// pass-through puro, non ripete quei controlli.
export async function updateDataType(
  prisma: PrismaClient,
  id: number,
  data: UpdateDataTypeInput
): Promise<DataType> {
  return prisma.dataType.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      kind: data.kind,
      cardinality: data.cardinality,
      assignability: data.assignability,
      mandatory: data.mandatory,
      sidebarShow: data.sidebarShow,
      sidebarOrder: data.sidebarOrder,
      icon: data.icon,
      renderAs: data.renderAs,
      visibility: data.visibility,
    },
    include: {
      campaign: true,
    },
  });
}

// Accetta `PrismaClient | Prisma.TransactionClient` (round 2, T-036): la
// route DELETE la chiama con lo stesso `tx` del guard
// `countCharacterDataByDataType` precedente, dentro un'unica
// `prisma.$transaction`, per chiudere la finestra TOCTOU tra il check e la
// cancellazione a cascata delle `ReferenceData`.
export async function deleteDataType(
  prisma: PrismaTransactionClient,
  id: number
): Promise<DataType> {
  return prisma.dataType.delete({
    where: { id },
  });
}
