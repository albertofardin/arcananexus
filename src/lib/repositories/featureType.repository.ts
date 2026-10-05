import type { FeatureType, Prisma, PrismaClient } from "@prisma/client";

// Catalogo delle funzioni feature disponibili sulla piattaforma (T-019):
// `functionName` mappa a un handler del registry dev-side
// (`src/lib/features/`), quindi — a differenza di `DataType`/`ReferenceData`
// — questo catalogo non è scopato a campagna e non è gestito via API: è
// sola-lettura per le campagne, che vi si agganciano creando una `Feature`
// (`feature.repository.ts`). Popolato ad ogni lettura da
// `ensureFeatureTypesRegistered` (`@/lib/features/registry`, non qui per
// evitare un import ciclico repository <-> registry), non da una migration
// o dal seed.

export async function listFeatureTypes(
  prisma: PrismaClient
): Promise<FeatureType[]> {
  return prisma.featureType.findMany({ orderBy: { featureName: "asc" } });
}

// Primitiva bulk usata SOLO da `ensureFeatureTypesRegistered`: `functionName`
// ha un vincolo UNIQUE a schema (safe, le categorie downtime custom di
// campagna usano un `crypto.randomUUID()`), quindi `skipDuplicates` è
// idempotente anche sotto richieste concorrenti (ON CONFLICT DO NOTHING).
export async function createFeatureTypesIfMissing(
  prisma: PrismaClient,
  rows: CreateFeatureTypeInput[]
): Promise<void> {
  if (rows.length === 0) return;
  await prisma.featureType.createMany({ data: rows, skipDuplicates: true });
}

export async function getFeatureTypeById(
  prisma: PrismaClient,
  id: number
): Promise<FeatureType | null> {
  return prisma.featureType.findUnique({ where: { id } });
}

// Usata dal seed per restare idempotente: non ricrea un `FeatureType` per una
// funzione del registry già catalogata.
export async function getFeatureTypeByFunctionName(
  prisma: PrismaClient,
  functionName: string
): Promise<FeatureType | null> {
  return prisma.featureType.findFirst({ where: { functionName } });
}

export interface CreateFeatureTypeInput {
  featureName: string;
  functionName: string;
  actionSchema: Prisma.InputJsonValue;
  featureSchema: Prisma.InputJsonValue;
}

export async function createFeatureType(
  prisma: PrismaClient,
  data: CreateFeatureTypeInput
): Promise<FeatureType> {
  return prisma.featureType.create({ data });
}
