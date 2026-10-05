import type {
  Campaign,
  Character,
  Feature,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { z } from "zod";
import type { FeatureHandlerDefinition, FeatureHandlerResult } from "./types";
import { createFeatureTypesIfMissing } from "@/lib/repositories/featureType.repository";

// Registry feature (T-019): mappa `functionName` → handler tipizzato. È il
// "registry dev sicuro" richiesto dall'obiettivo del task — nessun codice
// scritto dall'utente arriva qui, solo moduli in `src/lib/features/handlers/`
// che si auto-registrano import-time (vedi `./index.ts`).
const registry = new Map<string, FeatureHandlerDefinition<unknown>>();

// `functionName` non trovato: errore gestito (non un crash) — mappabile a un
// 422/500 di configurazione da un futuro chiamante HTTP (l'esecuzione azioni
// resta fuori scope T-019).
export class UnknownFeatureFunctionError extends Error {
  readonly functionName: string;

  constructor(functionName: string) {
    super(`Nessuna funzione feature registrata per "${functionName}".`);
    this.name = "UnknownFeatureFunctionError";
    this.functionName = functionName;
  }
}

// `actionData` non conforme all'`actionSchema` dell'handler risolto.
export class ActionDataValidationError extends Error {
  readonly functionName: string;
  readonly issues: z.ZodError["issues"];

  constructor(functionName: string, error: z.ZodError) {
    super(`I dati dell'azione non sono validi per "${functionName}".`);
    this.name = "ActionDataValidationError";
    this.functionName = functionName;
    this.issues = error.issues;
  }
}

// Registrazione: ogni modulo handler chiama questa funzione a import-time con
// la propria definizione tipizzata. Il cast a `FeatureHandlerDefinition<unknown>`
// è necessario solo per l'omogeneità della mappa (un registry eterogeneo non
// può conservare il tipo specifico di ciascun `TActionData`); il lookup
// (`getFeatureHandler`/`executeFeatureAction`) valida comunque `actionData`
// contro `actionSchema` prima di invocare l'handler, quindi non perde
// sicurezza a runtime.
export function registerFeatureHandler<TActionData>(
  definition: FeatureHandlerDefinition<TActionData>
): void {
  registry.set(
    definition.functionName,
    definition as unknown as FeatureHandlerDefinition<unknown>
  );
}

export function getFeatureHandler(
  functionName: string
): FeatureHandlerDefinition<unknown> {
  const definition = registry.get(functionName);
  if (definition) return definition;

  throw new UnknownFeatureFunctionError(functionName);
}

// `functionName` "conosciuto" dal registry (registrato esattamente). Usata
// dove serve un check booleano senza gestire l'eccezione di
// `getFeatureHandler` (es. la scheda personaggio, per filtrare le `Feature`
// sconosciute al codice).
export function isKnownFeatureFunctionName(functionName: string): boolean {
  return registry.has(functionName);
}

export function listRegisteredFeatureHandlers(): FeatureHandlerDefinition<unknown>[] {
  return Array.from(registry.values());
}

// Auto-provisioning del catalogo `FeatureType` (fix bug staging vs locale:
// prima appariva solo sui DB su cui era stato lanciato manualmente
// `prisma db seed`). Chiamata dall'unico consumer reale (GET
// `/api/feature-types`) prima di leggere il catalogo: allinea il DB al
// registry di codice ad ogni richiesta, così ogni ambiente/campagna vede
// sempre le feature disponibili, disattivate di default (nessuna riga
// `Feature` creata qui), senza dipendere da una migration o dal seed.
export async function ensureFeatureTypesRegistered(
  prisma: PrismaClient
): Promise<void> {
  const definitions = listRegisteredFeatureHandlers();

  await createFeatureTypesIfMissing(
    prisma,
    definitions.map(definition => ({
      featureName: definition.featureName,
      functionName: definition.functionName,
      actionSchema: z.toJSONSchema(definition.actionSchema, {
        unrepresentable: "any",
      }) as Prisma.InputJsonValue,
      featureSchema: z.toJSONSchema(definition.featureSchema, {
        unrepresentable: "any",
      }) as Prisma.InputJsonValue,
    }))
  );
}

// Solo per i test: azzera il registry senza dipendere dall'ordine/cache degli
// import dei moduli handler tra un test e l'altro.
export function __resetRegistryForTests(): void {
  registry.clear();
}

export interface ExecuteFeatureActionInput {
  functionName: string;
  character: Character;
  feature: Feature;
  actionData: unknown;
  campaign: Pick<Campaign, "id">;
  // Vedi `FeatureHandlerContext.bypassLimits` (`types.ts`): propagato così
  // com'è nel context dell'handler, additivo.
  bypassLimits?: boolean;
}

// Punto di ingresso del registry: risolve l'handler per `functionName` (errore
// gestito se sconosciuto), valida `actionData` contro il suo `actionSchema`
// (`ActionDataValidationError` se non conforme), poi invoca l'handler con
// `actionData` già tipizzato/parsato. Scaffold — non ancora agganciato a una
// route HTTP: il runner di esecuzione azioni/approvazione resta fuori scope
// T-019, pensato per un futuro endpoint che chiamerà questa funzione.
export async function executeFeatureAction(
  prisma: PrismaClient,
  input: ExecuteFeatureActionInput
): Promise<FeatureHandlerResult> {
  const definition = getFeatureHandler(input.functionName);

  const parsedActionData = definition.actionSchema.safeParse(input.actionData);
  if (!parsedActionData.success) {
    throw new ActionDataValidationError(
      input.functionName,
      parsedActionData.error
    );
  }

  return definition.handler(prisma, {
    character: input.character,
    feature: input.feature,
    campaign: input.campaign,
    actionData: parsedActionData.data,
    bypassLimits: input.bypassLimits,
  });
}
