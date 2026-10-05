import type {
  PrismaClient,
  DataRequirement,
  RequirementType,
} from "@prisma/client";
import type {
  CreateDataRequirementInput,
  PrismaTransactionClient,
} from "./types";
import type { ReferenceDataWithDataType } from "./referenceData.repository";

// `listIncomingRequirements` include sempre la voce dipendente (`definition`),
// con la sua `DataType` risolta (`ReferenceDataWithDataType`): serve sia alla
// GET del grafo (`requirements`, che mostra la Categoria oltre al nome della
// voce), sia al guard di cancellazione (T-027, elenco `id`/`name` delle voci
// che bloccano la rimozione, che ignora `dataType`).
export type DataRequirementWithDefinition = DataRequirement & {
  definition: ReferenceDataWithDataType;
};

// Requisiti in uscita, con la voce richiesta/bloccata (`requiredDefinition`)
// risolta (con `DataType`): serve al servizio di valutazione requisiti
// (T-017, `evaluateRequirements`) per sapere *quali* definizioni
// mancano/bloccano, non solo il loro id, e alla GET del grafo per mostrarne
// la Categoria.
export type DataRequirementWithRequiredDefinition = DataRequirement & {
  requiredDefinition: ReferenceDataWithDataType;
};

// Requisiti in uscita da una voce (ciò che quella voce richiede/blocca):
// serve sia alla GET del sotto-percorso `requirements`, sia (con `type:
// "requires"`) al check anti-ciclo, sia a `evaluateRequirements` (T-017).
//
// Accetta `PrismaTransactionClient` (non solo `PrismaClient`, T-018): la lettura
// dentro `evaluateRequirements` è ora componibile nella stessa transazione
// Prisma del chiamante (creazione PG: Character + grant iniziale +
// assegnazioni atomici), non più solo pre-transazionale.
export async function listOutgoingRequirements(
  prisma: PrismaTransactionClient,
  definitionId: number
): Promise<DataRequirementWithRequiredDefinition[]> {
  return prisma.dataRequirement.findMany({
    where: { definitionId },
    include: { requiredDefinition: { include: { dataType: true } } },
    orderBy: { id: "asc" },
  });
}

// Variante batch di `listOutgoingRequirements` (T-042): tutti gli archi
// uscenti per PIÙ definizioni in una sola query, invece di una per
// definizione. Serve a `sortAssignmentsByRequirements`
// (`characterData.service.ts`) per costruire il grafo `requires`
// dell'intero batch di assegnazioni di una creazione PG con una sola
// interrogazione, prima di ordinarlo topologicamente. Stessa forma di
// `listOutgoingRequirements` (incluso `requiredDefinition` risolto), solo
// scoped a un insieme di `definitionId` invece che a uno singolo.
export async function listOutgoingRequirementsForDefinitions(
  prisma: PrismaTransactionClient,
  definitionIds: number[]
): Promise<DataRequirementWithRequiredDefinition[]> {
  if (definitionIds.length === 0) return [];
  return prisma.dataRequirement.findMany({
    where: { definitionId: { in: definitionIds } },
    include: { requiredDefinition: { include: { dataType: true } } },
    orderBy: { id: "asc" },
  });
}

// Requisiti in entrata (voci che richiedono/bloccano questa): completa la
// vista del grafo lato route, ed è anche la query riusata dal guard di
// cancellazione di `ReferenceData` (T-027) per trovare chi dipende da questa
// voce prima di cancellarla. Stessa nota di `listOutgoingRequirements` sopra
// sul `PrismaTransactionClient` (T-018).
export async function listIncomingRequirements(
  prisma: PrismaTransactionClient,
  requiredDefinitionId: number
): Promise<DataRequirementWithDefinition[]> {
  return prisma.dataRequirement.findMany({
    where: { requiredDefinitionId },
    include: { definition: { include: { dataType: true } } },
    orderBy: { id: "asc" },
  });
}

// Vista "piatta" del grafo requisiti dell'intera campagna (solo id, niente
// `include`): serve al form di creazione PG (T-022) per un'anteprima
// client-side di requisiti/blocchi contro la selezione corrente (che non è
// ancora un `Character` in DB, quindi `evaluateRequirements`, T-017, non è
// applicabile — vedi commento sul chiamante). Filtrata via
// `definition.dataType.campaignId`: per invariante applicativo (verificato dal
// path di creazione in `requirements/route.ts`, che risolve entrambi i lati
// scoped alla stessa campagna) `requiredDefinitionId` appartiene sempre alla
// stessa campagna di `definitionId`, quindi non serve un doppio filtro.
// `groupId` incluso (T-039): il consumer client-side deve poter raggruppare
// gli archi `requires` in OR-group, stessa chiave usata da
// `evaluateRequirements` lato server.
export async function listRequirementsForCampaign(
  prisma: PrismaClient,
  campaignId: number
): Promise<
  Pick<
    DataRequirement,
    "id" | "definitionId" | "requiredDefinitionId" | "type" | "groupId"
  >[]
> {
  return prisma.dataRequirement.findMany({
    where: { definition: { dataType: { campaignId } } },
    select: {
      id: true,
      definitionId: true,
      requiredDefinitionId: true,
      type: true,
      groupId: true,
    },
    orderBy: { id: "asc" },
  });
}

export async function getDataRequirementById(
  prisma: PrismaClient,
  id: number
): Promise<DataRequirement | null> {
  return prisma.dataRequirement.findUnique({
    where: { id },
  });
}

// Accetta `PrismaTransactionClient` (T-0xx, creazione atomica talento +
// requisiti in bozza): la route POST di creazione la chiama dentro la stessa
// `prisma.$transaction` di `createReferenceData`.
export async function createDataRequirement(
  prisma: PrismaTransactionClient,
  data: CreateDataRequirementInput
): Promise<DataRequirement> {
  return prisma.dataRequirement.create({
    data: {
      definitionId: data.definitionId,
      requiredDefinitionId: data.requiredDefinitionId,
      type: data.type,
      groupId: data.groupId ?? null,
    },
  });
}

export async function deleteDataRequirement(
  prisma: PrismaClient,
  id: number
): Promise<DataRequirement> {
  return prisma.dataRequirement.delete({
    where: { id },
  });
}

// Tetto esplicito sulla profondità del BFS anti-ciclo (T-027): il `Set` di
// visitati garantisce già la terminazione (nessun loop infinito), ma senza un
// limite dichiarato una catena patologicamente lunga interrogherebbe il DB un
// livello alla volta senza un tetto esplicito. Valore generoso rispetto alla
// dimensione attesa di un catalogo per campagna (decine/centinaia di voci).
export const MAX_REQUIREMENT_DEPTH = 50;

// Errore esplicito e deterministico quando il BFS anti-ciclo supera
// `MAX_REQUIREMENT_DEPTH`: distinto da un timeout o da un loop che continua
// all'infinito — segnala una catena di `requires` anomala nel catalogo.
export class RequirementDepthExceededError extends Error {
  constructor(maxDepth: number) {
    super(
      `La catena di requisiti supera la profondità massima consentita (${maxDepth})`
    );
    this.name = "RequirementDepthExceededError";
  }
}

// Check anti-ciclo *best-effort* sul grafo di un singolo tipo di arco
// direzionale (T-016, generalizzato per `grants` — vedi piano): risalendo da
// `requiredDefinitionId` lungo gli archi `type` esistenti (BFS), verifica se
// si può raggiungere `definitionId` — se sì, l'arco `definitionId ->
// requiredDefinitionId` chiuderebbe un ciclo. `type` è esplicito (nessun
// default): `requires` e `grants` sono grafi logicamente separati, mai unire
// i due tipi nello stesso attraversamento (`blocks` non ha senso qui: è
// un'esclusione simmetrica, non una dipendenza direzionale — nessun
// chiamante lo passa). Profondità limitata esplicitamente da
// `MAX_REQUIREMENT_DEPTH` (T-027).
export async function wouldCreateRequirementCycle(
  prisma: PrismaClient,
  definitionId: number,
  requiredDefinitionId: number,
  type: RequirementType
): Promise<boolean> {
  if (definitionId === requiredDefinitionId) return true;

  const visited = new Set<number>([requiredDefinitionId]);
  let frontier = [requiredDefinitionId];
  let depth = 0;

  while (frontier.length > 0) {
    depth += 1;
    if (depth > MAX_REQUIREMENT_DEPTH) {
      throw new RequirementDepthExceededError(MAX_REQUIREMENT_DEPTH);
    }

    const edges = await prisma.dataRequirement.findMany({
      where: { definitionId: { in: frontier }, type },
      select: { requiredDefinitionId: true },
    });

    const next: number[] = [];
    for (const edge of edges) {
      if (edge.requiredDefinitionId === definitionId) return true;
      if (!visited.has(edge.requiredDefinitionId)) {
        visited.add(edge.requiredDefinitionId);
        next.push(edge.requiredDefinitionId);
      }
    }

    frontier = next;
  }

  return false;
}
