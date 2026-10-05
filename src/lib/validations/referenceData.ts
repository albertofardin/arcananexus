import z from "zod";
import { createDataRequirementSchema } from "./dataRequirement";

export const dataVisibilityEnum = z.enum(["hidden", "visible"]);

const referenceDataEditableFields = z.object({
  name: z.string().trim().min(1, "Il nome è obbligatorio").max(200),
  description: z.string().trim().nullable(),
  // Validato a monte del `kind` del `DataType` (schema Zod dedicato,
  // `referenceDataFlags.ts`): qui accettiamo solo che sia un valore
  // JSON-compatibile arbitrario.
  flags: z.unknown(),
  visibility: dataVisibilityEnum,
  fileUrl: z.string().trim().max(2000).nullable(),
  // Chiave del file su UploadThing (T-021): non esposta dal form di
  // gestione voce di catalogo, ma persistita insieme a `fileUrl` dal flusso
  // di upload (vedi `src/lib/documentUpload.ts`).
  fileKey: z.string().trim().max(200).nullable(),
  externalId: z.string().trim().max(200).nullable(),
});

export const createReferenceDataSchema = referenceDataEditableFields
  .partial()
  .extend({
    dataTypeId: z.number().int().positive(),
    name: z.string().trim().min(1, "Il nome è obbligatorio").max(200),
    // Requisiti in bozza (T-0xx, creazione atomica): creati in transazione
    // insieme alla voce, così un talento con requisiti "nasce" già completo
    // invece di doverli aggiungere in un secondo giro dopo il salvataggio.
    requirements: z.array(createDataRequirementSchema).optional(),
  })
  .strict();

export type CreateReferenceDataBody = z.infer<typeof createReferenceDataSchema>;

export const updateReferenceDataSchema = referenceDataEditableFields
  .partial()
  .strict()
  .refine(data => Object.keys(data).length > 0, {
    message: "Nessun campo da aggiornare",
  });

export type UpdateReferenceDataBody = z.infer<typeof updateReferenceDataSchema>;

// Shape di una `ReferenceData` così come restituita dalle route di gestione
// catalogo (`GET /api/campaigns/[campaignSlug]/reference-data`, T-016): usata
// lato client dalla UI admin (T-030) per validare la risposta prima di
// renderizzarla. Non `.strict()`: alcune route includono anche `dataType`
// sulla risposta (es. create/update), qui irrilevante e ignorato.
export const referenceDataAdminSchema = z.object({
  id: z.number(),
  dataTypeId: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  flags: z.unknown().nullable(),
  visibility: dataVisibilityEnum,
  fileUrl: z.string().nullable(),
  fileKey: z.string().nullable(),
  externalId: z.string().nullable(),
});

export type ReferenceDataAdmin = z.infer<typeof referenceDataAdminSchema>;

export const referenceDataAdminListSchema = z.array(referenceDataAdminSchema);

// ── Route "entry" (master-gated, sezione campagna `data/[dataSlug]`) ──────
// Sottoinsieme di campi esposti dal modal semplificato di creazione/modifica
// voce catalogo/pagina dalla pagina giocatore: niente `flags` (specifico per
// `kind`, resta dominio esclusivo dell'amministrazione head_master T-030) né
// i campi di upload documento (`fileUrl`/`fileKey`, gestiti dal flusso
// UploadThing dedicato, T-021).
export const createReferenceDataEntrySchema = z
  .object({
    dataTypeId: z.number().int().positive(),
    name: z.string().trim().min(1, "Il nome è obbligatorio").max(200),
    description: z.string().trim().nullable().optional(),
    visibility: dataVisibilityEnum.optional(),
  })
  .strict();

export type CreateReferenceDataEntryBody = z.infer<
  typeof createReferenceDataEntrySchema
>;

export const updateReferenceDataEntrySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Il nome è obbligatorio")
      .max(200)
      .optional(),
    description: z.string().trim().nullable().optional(),
    visibility: dataVisibilityEnum.optional(),
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, {
    message: "Nessun campo da aggiornare",
  });

export type UpdateReferenceDataEntryBody = z.infer<
  typeof updateReferenceDataEntrySchema
>;

// Riordino manuale (drag&drop) delle voci di un `DataType`, qualunque
// `renderAs` (files, catalog o pages).
export const reorderReferenceDataSchema = z.object({
  orderedIds: z.array(z.number().int().positive()).min(1),
});

export type ReorderReferenceDataBody = z.infer<
  typeof reorderReferenceDataSchema
>;
