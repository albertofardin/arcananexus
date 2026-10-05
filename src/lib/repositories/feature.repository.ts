import type {
  Feature,
  FeatureType,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import type { PrismaTransactionClient } from "./types";

// `Feature` = configurazione per-campagna di un `FeatureType` del catalogo
// (T-019): "questa campagna ha attivato la funzione X del registry, con
// questi parametri (`featureData`)". Scopata a campagna come `DataType`/
// `ReferenceData` — stesso trattamento multi-tenant (404, non 403, per un id
// valido di un'altra campagna).

export type FeatureWithType = Feature & { featureType: FeatureType };

export async function listFeaturesForCampaign(
  prisma: PrismaClient,
  campaignId: number
): Promise<FeatureWithType[]> {
  return prisma.feature.findMany({
    where: { campaignId },
    orderBy: { id: "asc" },
    include: { featureType: true },
  });
}

export async function getFeatureByIdScoped(
  prisma: PrismaClient,
  id: number,
  campaignId: number
): Promise<FeatureWithType | null> {
  return prisma.feature.findUnique({
    where: { id, campaignId },
    include: { featureType: true },
  });
}

// Risolve la `Feature` della campagna per un `functionName` del registry
// (T-033): usata dalla route di esecuzione azioni
// (`characters/[characterId]/actions`) per sapere "questa campagna ha
// davvero attivato questa funzione, con questi `featureData`" prima di
// invocare `executeFeatureAction`. `functionName` non è UNIQUE a schema su
// `FeatureType` (vedi `featureType.repository.ts`), quindi in teoria più
// `Feature` della stessa campagna potrebbero risolvere allo stesso
// `functionName`: `findFirst` con lo stesso ordinamento di
// `listFeaturesForCampaign` (per id) sceglie deterministicamente la prima.
// `options.activeOnly` (default `true`) filtra le `Feature` disattivate
// (`active: false`, soft-toggle T-0xx): i chiamanti che devono vedere il
// segnale grezzo (es. la scheda personaggio, per distinguere "mai
// configurata" da "disattivata") passano `activeOnly: false`.
// Accetta `PrismaTransactionClient` (T-0xx, notifica downtime risolta
// DENTRO la transazione di `handlers/downtimeAction.ts`): stesso contratto
// di composabilità già usato da `updateFeature` in questo stesso file.
export async function getFeatureByFunctionName(
  prisma: PrismaTransactionClient,
  campaignId: number,
  functionName: string,
  options?: { activeOnly?: boolean }
): Promise<FeatureWithType | null> {
  const activeOnly = options?.activeOnly ?? true;
  return prisma.feature.findFirst({
    where: {
      campaignId,
      featureType: { functionName },
      ...(activeOnly ? { active: true } : {}),
    },
    orderBy: { id: "asc" },
    include: { featureType: true },
  });
}

export interface CreateFeatureInput {
  campaignId: number;
  featureTypeId: number;
  featureData: Prisma.InputJsonValue;
}

// Upsert-aware (T-0xx, soft-toggle): una `Feature` per `(featureTypeId,
// campaignId)` è ora UNIQUE a schema (`@@unique`), quindi una campagna che
// riattiva una funzione disattivata in precedenza (`updateFeature(...,
// { active: false })`, mai un hard delete) deve riusare la riga esistente,
// non provare a crearne una seconda (violerebbe il vincolo E perderebbe lo
// storico `Action` collegato, che ha `onDelete: Cascade` su `Feature`).
// `prisma.feature.upsert` (non `findUnique` + `create`/`update`, come prima)
// per essere atomico: sotto due chiamate concorrenti sulla stessa coppia
// `(featureTypeId, campaignId)`, un `findUnique` poi `create` potrebbe far
// leggere `null` a entrambe e far violare il vincolo unique alla seconda
// (`P2002` non gestito). L'upsert lascia a Postgres la scelta atomica fra
// insert e update.
export async function createFeature(
  prisma: PrismaClient,
  data: CreateFeatureInput
): Promise<FeatureWithType> {
  return prisma.feature.upsert({
    where: {
      featureTypeId_campaignId: {
        featureTypeId: data.featureTypeId,
        campaignId: data.campaignId,
      },
    },
    create: data,
    update: { featureData: data.featureData, active: true },
    include: { featureType: true },
  });
}

export interface UpdateFeatureInput {
  featureData?: Prisma.InputJsonValue;
  active?: boolean;
  paused?: boolean;
}

// `featureTypeId`/`campaignId` non sono aggiornabili: cambiare la funzione a
// cui una `Feature` è agganciata invaliderebbe le `Action` già create con
// quella configurazione — coerente con `dataTypeId` non modificabile su
// `ReferenceData`. Entrambi i campi sono opzionali: il caso "disattiva/
// riattiva" (`{ active }`) non deve toccare `featureData`, e viceversa.
export async function updateFeature(
  prisma: PrismaTransactionClient,
  id: number,
  data: UpdateFeatureInput
): Promise<FeatureWithType> {
  return prisma.feature.update({
    where: { id },
    data: {
      ...(data.featureData !== undefined
        ? { featureData: data.featureData }
        : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      ...(data.paused !== undefined ? { paused: data.paused } : {}),
    },
    include: { featureType: true },
  });
}
