import { z } from "zod";

// Estratto da `progress.ts` (solo lo schema, zero import server-only,
// T-0xx): `progress.ts` importa `talents.ts`/`deathXpRecovery.ts` per
// costruire l'handler orchestratore (Opzione B, un solo `functionName`
// eseguibile) — quei due moduli trascinano `characterData.service.ts`/
// `xp.service.ts`/i rispettivi repository, stesso motivo per cui
// `missive.schema.ts` esiste separato da `missive.ts` (vedi il commento
// lì). `ModalFeatureProgress.tsx` (Client Component) importa
// direttamente da qui, MAI da `progress.ts` — un suo import
// trascinerebbe l'intera catena server-only nel bundle browser.
export const progressFeatureSchema = z
  .object({
    talentsEnabled: z.boolean().default(false).meta({
      title: "Talenti abilitati",
    }),
    // "Punti XP" è l'unica modalità implementata: il campo è già persistito
    // (invece di dedurlo implicitamente) così una futura "statistiche" non
    // richiede una migration, solo l'abilitazione lato UI (oggi bloccata,
    // "Coming soon" — vedi `ModalFeatureProgress.tsx`).
    progressionMode: z.enum(["xp", "stats"]).default("xp").meta({
      title: "Modalità di progressione del personaggio",
    }),
    deathXpRecoveryEnabled: z.boolean().default(false).meta({
      title: "Recupero XP alla morte abilitato",
    }),
    // Percentuale di XP disponibile del PG defunto recuperata dal
    // successore (T-019, ex `deathXpRecoveryFeatureSchema` — vedi
    // `handlers/deathXpRecovery.ts`): default `50`, rilevante solo quando
    // `deathXpRecoveryEnabled` è `true`. Nome con prefisso `deathXpRecovery`
    // per coerenza con `deathXpRecoveryEnabled` (a differenza del generico
    // `talentsEnabled`, qui il sotto-toggle ha anche un parametro proprio).
    deathXpRecoveryPercentage: z.number().min(0).max(100).default(50).meta({
      title:
        "Percentuale di XP disponibile del PG defunto recuperata dal successore",
    }),
  })
  .strict();

export type ProgressFeatureData = z.infer<typeof progressFeatureSchema>;
