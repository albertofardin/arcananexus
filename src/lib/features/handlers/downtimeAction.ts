import { NotificationType, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { registerFeatureHandler } from "../registry";
import type { FeatureHandlerContext, FeatureHandlerResult } from "../types";
import { spendDowntimePoint } from "../downtimePoints";
import { FT_DOWNTIME } from "../featuresName";
import { downtimeFeatureSchema } from "./downtime";
import { createAction } from "@/lib/repositories/action.repository";
import { createNotifications } from "@/lib/repositories/notification.repository";

// Forma "titolo + testo libero" condivisa con `missive.ts`
// (`missiveActionSchema`/`missiveFreeReceiverActionSchema` la estendono via
// `.extend()`, MAI questo modulo aggiunge campi qui sopra): deve restare
// esattamente `{ subject, description }`, nessun campo downtime-specifico
// (es. `category` sotto), altrimenti si propagherebbe come required anche
// alle missive.
export const downtimeActionSchema = z
  .object({
    // Titolo dell'azione: mostrato in lista al posto della descrizione
    // completa, stesso identico campo/stile di `missiveActionSchema.subject`.
    subject: z.string().trim().min(1),
    description: z.string().trim().min(1),
  })
  .strict();

// Handler dell'azione Downtime (cap. 16, T-040 → T-0xx unificazione
// categorie): un solo `functionName` (`FT_DOWNTIME`, il contenitore stesso,
// niente più una `FeatureType`/`Feature` per categoria — vedi
// `handlers/downtime.ts`), la categoria scelta dal giocatore (`category`,
// una stringa libera tra quelle configurate in `downtimeFeatureSchema.
// categories`, non validata contro l'elenco: un rename/rimozione successiva
// della categoria in configurazione non deve invalidare le azioni storiche
// già dichiarate con il nome precedente) viaggia dentro `actionData`, non
// più nel `functionName`. Stesso comportamento per qualunque categoria: il
// giocatore dichiara un'azione a testo libero, che ha sempre effetto
// immediato — nessun motore di risoluzione automatico (mercato/monete/
// inventario/edifici esplicitamente fuori scope, vedi `.task/040-*.md`), la
// valutazione narrativa resta manuale.
//
// Estende `downtimeActionSchema` (non il contrario): schema SOLO di questo
// handler, mai importato da `missive.ts` — a differenza di
// `downtimeActionSchema` sopra.
const downtimeDeclareActionSchema = downtimeActionSchema.extend({
  // Categoria scelta (T-0xx): una delle stringhe in
  // `downtimeFeatureSchema.categories` al momento della dichiarazione,
  // salvata qui com'è — stesso principio di `subject`/`description`, testo
  // libero mai più validato lato server dopo la creazione dell'`Action`.
  category: z.string().trim().min(1),
});

export type DowntimeActionData = z.infer<typeof downtimeDeclareActionSchema>;

// Ogni azione downtime costa sempre 1 punto downtime del personaggio,
// scalato atomicamente insieme alla creazione dell'`Action` — a differenza
// di `talents` (dove il costo è opt-in per campagna, `requiresDowntimePoint`)
// e delle due missive (`missive.ts`, stesso opt-in più il proprio contatore
// dedicato), qui non è configurabile: è la semantica stessa di un'azione
// downtime.
async function handler(
  prisma: PrismaClient,
  context: FeatureHandlerContext<DowntimeActionData>
): Promise<FeatureHandlerResult> {
  const { character, feature, actionData, campaign } = context;

  return prisma.$transaction(async tx => {
    await spendDowntimePoint(tx, character);

    // `status` non è un campo che il giocatore invia (`downtimeActionSchema`
    // non lo contiene, è `.strict()`): impostato qui, server-side, dopo la
    // validazione dell'input — ogni downtime nasce "in attesa" (T-0xx,
    // `DOWNTIME_STATUSES`), stesso stato di default che `resolveDowntimeStatus`
    // applica comunque in lettura alle righe storiche prive del campo.
    const action = await createAction(tx, {
      characterId: character.id,
      featureId: feature.id,
      actionData: { ...actionData, status: "waiting" },
    });

    // Notifica (T-0xx, pannello notifiche): SOLO gli utenti esplicitamente
    // configurati per la campagna (`notifyUserIds` sul contenitore, che è
    // già `feature` qui — un solo `functionName` `FT_DOWNTIME` per ogni
    // azione downtime, a differenza di prima quando `feature` era la
    // categoria specifica e il contenitore andava risolto a parte).
    const { notifyUserIds } = downtimeFeatureSchema.parse(feature.featureData);
    await createNotifications(
      tx,
      notifyUserIds.map(userId => ({
        userId,
        campaignId: campaign.id,
        type: NotificationType.downtime,
        entityId: action.id,
      }))
    );

    return { action };
  });
}

registerFeatureHandler({
  featureName: "Downtime",
  functionName: FT_DOWNTIME,
  actionSchema: downtimeDeclareActionSchema,
  featureSchema: downtimeFeatureSchema,
  handler,
});
