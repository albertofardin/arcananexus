import { DataVisibility } from "@prisma/client";
import z from "zod";

// Input passato dal client all'`.input()` del file router UploadThing
// (`src/app/api/uploadthing/core.ts`, T-021), validato lato server nel
// `.middleware()` prima di autorizzare l'upload. `referenceDataId` distingue
// "carica nuovo documento" (assente) da "sostituisci documento esistente"
// (presente): nel secondo caso il vecchio file va ripulito su UploadThing
// dopo l'upload del nuovo (vedi `src/lib/documentUpload.ts`).
export const documentUploadInputSchema = z.object({
  campaignSlug: z.string().trim().min(1),
  dataTypeId: z.number().int().positive(),
  title: z.string().trim().min(1, "Il titolo è obbligatorio").max(200),
  referenceDataId: z.number().int().positive().optional(),
  // Descrizione opzionale, mostrata sotto il titolo (vedi
  // `DocumentsManager.tsx`): presa in considerazione solo in creazione,
  // ignorata in sostituzione (che passa solo il nuovo file, la descrizione
  // resta quella già impostata — modificabile via rinomina, non qui).
  description: z.string().trim().nullable().optional(),
  // Visibilità scelta in creazione (default `visible` se assente, vedi
  // `applyDocumentUpload`); ignorata in sostituzione, stesso motivo della
  // descrizione qui sopra.
  visibility: z.nativeEnum(DataVisibility).optional(),
});

export type DocumentUploadInput = z.infer<typeof documentUploadInputSchema>;
