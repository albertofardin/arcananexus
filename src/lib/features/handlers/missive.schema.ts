import { z } from "zod";
import { pointBonusesSchema } from "../pointBonus";

// Estratto da `missive.ts` (solo lo schema, zero import server-only):
// `missive.ts` ha side-effect a import-time (`registerFeatureHandler`) che
// trascinano `notification.repository.ts` -> `webpush.ts` -> `web-push` ->
// `https-proxy-agent`, pacchetto che richiede i moduli Node `tls`/`net` (non
// disponibili nel bundle browser). `missiveFeatureSchema` serve anche a due
// Client Component (`CharacterEditor.tsx`, `ModalFeatureMissive.tsx`) per
// validare/leggere `featureData` lato client: importarlo da `missive.ts`
// trascinava l'intera catena server-only nel bundle client, facendo fallire
// `bun run build` su `Module not found: Can't resolve 'tls'`. Questo modulo
// non deve MAI importare nulla oltre a `zod`.
export const missiveFeatureSchema = z
  .object({
    maxPerEvent: z.coerce.number().int().min(0).default(0).meta({
      title: "Missive disponibili per PG tra un evento e l'altro",
    }),
    pngCountsAsDowntime: z.boolean().default(false).meta({
      title:
        "Le missive a PNG scalano dal conteggio downtime invece che dal conteggio missive",
    }),
    canAnswer: z.boolean().default(false).meta({
      title: "Il destinatario di una missiva diretta può rispondere",
    }),
    canAnswerFree: z.boolean().default(false).meta({
      title: "Le risposte non consumano punti missiva/downtime",
    }),
    canAnswerThread: z.boolean().default(false).meta({
      title: "Lo scambio di risposte può continuare senza limiti",
    }),
    maxThreadMessages: z.coerce.number().int().min(2).default(50).meta({
      title: "Numero massimo di messaggi nel thread (radice inclusa)",
    }),
    // Destinatari delle notifiche per una missiva "Campo libero" (T-0xx,
    // pannello notifiche): l'unico caso in cui una missiva non ha un
    // `Character`/utente reale a cui indirizzare la notifica (vedi
    // `isFreeReceiverMissive` in `notification.repository.ts`) — stesso
    // pattern di `notifyUserIds` sul contenitore `FT_DOWNTIME`
    // (`handlers/downtime.ts`): elenco di `User.id`, non `Grant`.
    notifyUserIds: z.array(z.string()).default([]).meta({
      title:
        "Utenti da notificare quando viene inviata una missiva a Campo libero",
    }),
    pointBonuses: pointBonusesSchema.meta({
      title: "Bonus/malus di punti missiva per singolo personaggio",
    }),
  })
  .strict()
  .refine(
    data => data.canAnswer || (!data.canAnswerFree && !data.canAnswerThread),
    {
      message: "canAnswerFree/canAnswerThread richiedono canAnswer attiva",
      path: ["canAnswer"],
    }
  );

export type MissiveFeatureData = z.infer<typeof missiveFeatureSchema>;
