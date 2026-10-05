import z from "zod";
import { FT_MISSIVE } from "@/lib/features/featuresName";

// Corpo di `POST /api/campaigns/[campaignSlug]/characters/[characterId]/actions`
// (T-033): `actionData` è validato una seconda volta all'edge, dentro
// `executeFeatureAction` (T-019), contro l'`actionSchema` dell'handler
// risolto da `functionName` — qui è solo "un valore JSON qualsiasi", stesso
// ruolo di `featureData: z.unknown()` in `validations/feature.ts`.
export const executeActionSchema = z
  .object({
    functionName: z.string().min(1),
    actionData: z.unknown(),
  })
  .strict();

export type ExecuteActionBody = z.infer<typeof executeActionSchema>;

// Corpo di `POST /api/campaigns/[campaignSlug]/actions` (T-0xx): a
// differenza di `executeActionSchema`, non c'è un `characterId` nel path (è
// l'endpoint per le azioni dichiarate "a nome del master", nessun PG reale
// come mittente) — `functionName` è quindi bloccato a `FT_MISSIVE`, l'unico
// caso d'uso oggi, invece di una stringa libera: questo endpoint non deve
// diventare un varco generico per azioni senza personaggio su altre feature.
export const executeMasterActionSchema = z
  .object({
    functionName: z.literal(FT_MISSIVE),
    actionData: z.unknown(),
  })
  .strict();

export type ExecuteMasterActionBody = z.infer<typeof executeMasterActionSchema>;
