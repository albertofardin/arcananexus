import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { registerFeatureHandler } from "../registry";
import type { FeatureHandlerContext, FeatureHandlerResult } from "../types";
import { FT_PROGRESS } from "../featuresName";
import {
  progressFeatureSchema,
  type ProgressFeatureData,
} from "./progress.schema";
import { talentsActionSchema, handler as learnTalentHandler } from "./talents";
import {
  deathXpRecoveryActionSchema,
  handler as recoverDeathXpHandler,
} from "./deathXpRecovery";

// Ri-esportati per non rompere gli importatori server-side esistenti (zero
// import server-only in `progress.schema.ts`, vedi commento lì): un
// Client Component importa direttamente da `progress.schema.ts`, MAI
// da qui — un suo import trascinerebbe l'intera catena server-only di
// `talents.ts`/`deathXpRecovery.ts` nel bundle browser.
export { progressFeatureSchema, type ProgressFeatureData };

// Progressione del personaggio (T-0xx, fusione Talenti + Recupero XP alla
// morte, Opzione B): un solo `functionName` eseguibile — `talents.ts`/
// `deathXpRecovery.ts` non registrano più da soli, esportano solo la loro
// funzione handler (rinominata all'import per evitare la collisione di
// nome) e il proprio `actionSchema` di base. Il campo discriminante `kind`
// dice a QUALE delle due azioni appartiene una dichiarazione: stesso
// principio delle categorie downtime unificate sotto `FT_DOWNTIME` (un
// contenitore unico, il "quale" vive dentro `actionData`), qui applicato a
// due azioni con `actionSchema`/logica realmente diverse (non solo
// un'etichetta) — da cui l'union discriminata invece di un semplice campo
// libero.
export const progressActionSchema = z.discriminatedUnion("kind", [
  talentsActionSchema.extend({ kind: z.literal("talent") }),
  deathXpRecoveryActionSchema.extend({ kind: z.literal("deathXpRecovery") }),
]);

export type ProgressActionData = z.infer<typeof progressActionSchema>;

// Il sotto-toggle scelto (`talentsEnabled`/`deathXpRecoveryEnabled`) non è
// abilitato per questa campagna: stesso esito "non attiva" di una Feature
// mai configurata, mappato a 404 dalla route di esecuzione azioni — non un
// 422 (non è un problema di validazione dell'input, è una capacità
// disattivata dal master).
export class SubFeatureDisabledError extends Error {
  constructor(featureName: string) {
    super(`La funzione "${featureName}" non è attiva in questa campagna.`);
    this.name = "SubFeatureDisabledError";
  }
}

// Dispatcher (T-0xx): legge `progressFeatureSchema` UNA sola volta
// (nessuna duplicazione del parse nei due sotto-handler, che infatti non
// lo fanno più per il proprio gate — vedi `talents.ts`), verifica il
// sotto-toggle giusto in base a `kind`, poi delega. `context.feature` è
// sempre la `Feature` "progress" (mai una propria per `talents`/
// `deathXpRecovery`), il suo `id` diventa `Action.featureId` a prescindere
// da quale delle due azioni sia stata eseguita.
async function handler(
  prisma: PrismaClient,
  context: FeatureHandlerContext<ProgressActionData>
): Promise<FeatureHandlerResult> {
  const config = progressFeatureSchema.parse(context.feature.featureData);

  if (context.actionData.kind === "talent") {
    if (!config.talentsEnabled) {
      throw new SubFeatureDisabledError("Talenti");
    }
    return learnTalentHandler(prisma, {
      ...context,
      actionData: context.actionData,
    });
  }

  if (!config.deathXpRecoveryEnabled) {
    throw new SubFeatureDisabledError("Recupero XP alla morte");
  }
  return recoverDeathXpHandler(prisma, {
    ...context,
    actionData: context.actionData,
  });
}

registerFeatureHandler({
  featureName: "Progressi",
  functionName: FT_PROGRESS,
  actionSchema: progressActionSchema,
  featureSchema: progressFeatureSchema,
  handler,
});
