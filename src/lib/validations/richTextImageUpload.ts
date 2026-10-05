import { z } from "zod";

// Input del file router UploadThing `richTextImageUploader` (immagini
// inserite inline in un `FieldRichText`, es. descrizione azione downtime o
// missiva). Stessa forma di `campaignPresentationImageUploadInputSchema`:
// solo lo slug basta a risolvere la campagna, l'autorizzazione concreta vive
// in `src/lib/richTextImageUpload.ts`.
export const richTextImageUploadInputSchema = z.object({
  campaignSlug: z.string().trim().min(1),
});

export type RichTextImageUploadInput = z.infer<
  typeof richTextImageUploadInputSchema
>;
