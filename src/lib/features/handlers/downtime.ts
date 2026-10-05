import { z } from "zod";
import { pointBonusesSchema } from "../pointBonus";

// Schema del contenitore `FT_DOWNTIME` (una sola `Feature` per campagna):
// pilota attivo/disattivo, tetto punti, notifiche e l'elenco delle categorie
// disponibili (T-0xx, fix "ogni categoria è una FeatureType globale" — le
// categorie sono ora semplici stringhe qui dentro, non più righe separate
// nel catalogo piattaforma, vedi `handlers/downtimeAction.ts` per l'handler
// reale registrato su questo stesso `functionName`). Zero import
// server-only qui (stesso motivo di `missive.schema.ts`): riusato da
// `ModalFeatureDowntime.tsx`/`CharacterEditor.tsx` (Client Component) per
// leggere `featureData` lato client.
export const downtimeFeatureSchema = z
  .object({
    maxPoints: z.coerce.number().int().min(0).default(0).meta({
      title: "Punti downtime massimi per personaggio",
    }),
    // Destinatari delle notifiche "azione downtime dichiarata" (T-0xx,
    // pannello notifiche): un'UNICA lista per l'intera campagna, valida per
    // TUTTE le categorie downtime. Elenco di `User.id`, non `Grant`: la
    // selezione avviene una tantum in configurazione, l'appartenenza allo
    // staff può cambiare dopo senza dover ri-salvare qui (stesso principio
    // di `Action.authorUserId`, un riferimento diretto all'utente).
    notifyUserIds: z.array(z.string()).default([]).meta({
      title: "Utenti da notificare quando viene dichiarata un'azione downtime",
    }),
    // Elenco libero di categorie downtime della campagna (T-0xx, fix
    // catalogo globale): semplici stringhe scelte dal giocatore in
    // `DowntimeWriter`, salvate poi in `Action.actionData.category` — niente
    // più una `FeatureType`/`Feature` dedicata per categoria, niente
    // attiva/disattiva per singola categoria (solo l'intera feature
    // "Downtime" ha un on/off).
    categories: z.array(z.string().trim().min(1)).default([]).meta({
      title: "Categorie downtime disponibili in questa campagna",
    }),
    pointBonuses: pointBonusesSchema.meta({
      title: "Bonus/malus di punti downtime per singolo personaggio",
    }),
  })
  .strict();

export type DowntimeFeatureData = z.infer<typeof downtimeFeatureSchema>;

// `FT_DOWNTIME` è registrato da `handlers/downtimeAction.ts` (l'handler
// reale, eseguibile come azione): questo modulo resta solo lo schema
// client-safe, nessun `registerFeatureHandler` qui.
