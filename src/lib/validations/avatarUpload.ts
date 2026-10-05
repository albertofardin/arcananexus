import { z } from "zod";

// Input del file router UploadThing `avatarUploader` (vedi
// `src/app/api/uploadthing/core.ts`): identifica su cosa scrivere l'avatar
// una volta caricato. Un solo endpoint condiviso da profilo utente e
// personaggio, come `documentUploader` è condiviso da tutte le categorie
// documenti (T-021) — l'autorizzazione concreta vive in
// `src/lib/avatarUpload.ts`.
export const avatarUploadInputSchema = z.discriminatedUnion("target", [
  z.object({ target: z.literal("user") }),
  z.object({
    target: z.literal("character"),
    characterId: z.number().int().positive(),
  }),
]);

export type AvatarUploadInput = z.infer<typeof avatarUploadInputSchema>;

// Qualità WebP (scala 0-100 di sharp) condivisa dal percorso di conversione
// server-side (`src/lib/avatarUpload.ts`) e da quello client-side
// (`AvatarUpload.tsx`, che la converte alla propria scala 0-1): stessa resa
// visiva indipendentemente da quale dei due esegue la conversione.
export const AVATAR_WEBP_QUALITY = 82;
