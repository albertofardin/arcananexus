import z from "zod";

// `featureData` è validato una seconda volta all'edge, contro il
// `featureSchema` dell'handler risolto dal registry (T-019, `getFeatureHandler`
// via `FeatureType.functionName`) — qui è solo "un valore JSON qualsiasi",
// stesso ruolo di `flags: unknown` in `createReferenceDataSchema`.
export const createFeatureSchema = z
  .object({
    featureTypeId: z.number().int().positive(),
    featureData: z.unknown(),
  })
  .strict();

export type CreateFeatureBody = z.infer<typeof createFeatureSchema>;

// `featureTypeId` non è modificabile: cambiare la funzione a cui una
// `Feature` è agganciata invaliderebbe la config già validata contro
// l'`actionSchema`/`featureSchema` della funzione precedente (stessa logica
// di `dataTypeId` fisso su `ReferenceData`). `active` è opzionale (T-0xx,
// soft-toggle): permette al chiamante di disattivare/riattivare senza dover
// rimandare anche `featureData`.
export const updateFeatureSchema = z
  .object({
    featureData: z.unknown().optional(),
    active: z.boolean().optional(),
    paused: z.boolean().optional(),
  })
  .strict();

export type UpdateFeatureBody = z.infer<typeof updateFeatureSchema>;

// Forma di risposta di `GET /api/feature-types` (T-031) e del catalogo
// FeatureType incluso in `GET /api/campaigns/[campaignSlug]/features`.
// `actionSchema`/`featureSchema` sono lo snapshot JSON Schema (`z.toJSONSchema`,
// seed) degli stessi Zod schema del registry — qui restano `unknown`: la UI
// (T-031) li introspeziona in modo tollerante (vedi
// `features.ts`) invece di dipendere da una forma tipizzata rigida,
// dato che non sono controllati da questo layer.
export const featureTypeSchema = z.object({
  id: z.number(),
  featureName: z.string(),
  functionName: z.string(),
  actionSchema: z.unknown(),
  featureSchema: z.unknown(),
});

export type FeatureTypeDto = z.infer<typeof featureTypeSchema>;

// Forma di risposta di `GET /api/campaigns/[campaignSlug]/features`
// (`FeatureWithType`, T-019): la `Feature` di campagna con il suo
// `FeatureType` incluso.
export const featureWithTypeSchema = z.object({
  id: z.number(),
  featureTypeId: z.number(),
  campaignId: z.number(),
  featureData: z.unknown(),
  active: z.boolean(),
  paused: z.boolean(),
  featureType: featureTypeSchema,
});

export type FeatureWithTypeDto = z.infer<typeof featureWithTypeSchema>;

// Body di `PUT .../downtime-settings` (T-0xx): toggle attivo/disattivo del
// downtime a livello di campagna + tetto punti per personaggio, upsert della
// `Feature` `downtime` — vedi `downtimeFeatureSchema`
// (`handlers/downtime.ts`) per la validazione reale di `maxPoints`/
// `notifyUserIds`/`categories`, qui è solo la shape del body all'edge.
// `notifyUserIds`/`categories` (T-0xx, pannello notifiche/fix catalogo
// globale): default `[]`, non `.required()` — un client non ancora
// aggiornato che non li invia non deve rompere il salvataggio del resto
// delle impostazioni.
export const updateDowntimeSettingsSchema = z
  .object({
    active: z.boolean(),
    maxPoints: z.coerce.number().int().min(0),
    notifyUserIds: z.array(z.string()).default([]),
    categories: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

export type UpdateDowntimeSettingsBody = z.infer<
  typeof updateDowntimeSettingsSchema
>;
