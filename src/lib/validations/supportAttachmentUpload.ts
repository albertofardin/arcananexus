import { z } from "zod";

// Input del file router UploadThing `supportAttachmentUploader` (immagini
// inserite inline in un messaggio di Supporto, T-0xx): a differenza di
// `richTextImageUploadInputSchema` non c'è alcuno slug di campagna da
// risolvere (il Supporto non è campaign-scoped) — basta la sessione,
// verificata in `authorizeSupportAttachmentUpload`. Oggetto vuoto invece di
// nessun `.input()` per uniformità con gli altri endpoint del router.
export const supportAttachmentUploadInputSchema = z.object({});

export type SupportAttachmentUploadInput = z.infer<
  typeof supportAttachmentUploadInputSchema
>;
