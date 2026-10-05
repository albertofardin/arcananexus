import type {
  Action,
  Campaign,
  Character,
  CharacterData,
  Feature,
  PrismaClient,
  XpTransaction,
} from "@prisma/client";
import type { z } from "zod";

// Contratto d'ingresso condiviso da ogni handler del registry feature
// (T-019): la campagna è passata come `Pick<Campaign, "id">` perché è tutto
// ciò di cui un handler ha bisogno per lo scoping multi-tenant — i chiamanti
// (route/servizi che risolvono la campagna dallo slug) non devono ricostruire
// un `Campaign` completo.
export interface FeatureHandlerContext<TActionData = unknown> {
  character: Character;
  feature: Feature;
  actionData: TActionData;
  campaign: Pick<Campaign, "id">;
  // Additivo (T-0xx, bypass missivePoints/downtimePoints per master/
  // head_master/super-admin): opzionale, letto solo dall'handler `missive`
  // — ogni altro handler registrato (downtime, talents,
  // deathXpRecovery) lo ignora, quindi resta additivo e non rompe il loro
  // contratto. Propagato dal chiamante HTTP (`executeFeatureAction`), che
  // sa già se l'esecutore è master/head_master/super-admin della campagna.
  bypassLimits?: boolean;
}

// Output minimo comune: ogni handler logga sempre un'`Action` (il "log" dello
// scope T-019); `characterData`/`xpTransaction` sono opzionali perché non
// tutti gli handler ne producono (es. il recupero XP alla morte non tocca
// mai `CharacterData`).
export interface FeatureHandlerResult {
  action: Action;
  characterData?: CharacterData | null;
  xpTransaction?: XpTransaction | null;
}

export type FeatureHandlerFn<TActionData = unknown> = (
  prisma: PrismaClient,
  context: FeatureHandlerContext<TActionData>
) => Promise<FeatureHandlerResult>;

// Definizione registrata nel registry: `featureName` è l'etichetta umana
// (mostrata in una futura UI di configurazione), `functionName` è la chiave
// tecnica — deve combaciare con `FeatureType.functionName` a DB (T-019, nessun
// vincolo UNIQUE a schema: l'unicità è responsabilità del seed). `actionSchema`
// / `featureSchema` sono codice (Zod), non JSON-Schema autoriale — stesso
// principio di `referenceDataFlags.ts` (T-016): validano rispettivamente
// `Action.actionData` e `Feature.featureData` "all'edge", prima che
// l'handler li veda tipizzati.
export interface FeatureHandlerDefinition<TActionData = unknown> {
  featureName: string;
  functionName: string;
  actionSchema: z.ZodType<TActionData>;
  featureSchema: z.ZodType;
  handler: FeatureHandlerFn<TActionData>;
}
