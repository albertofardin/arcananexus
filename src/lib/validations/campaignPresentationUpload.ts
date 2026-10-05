import { z } from "zod";
import {
  campaignColorEnum,
  campaignTextureEnum,
} from "@/lib/validations/campaign";

// Input condiviso dai tre file router UploadThing della "Presentazione"
// campagna (T-045): `campaignLogoUploader`, `campaignCoverUploader`,
// `campaignGalleryUploader` (vedi `src/app/api/uploadthing/core.ts`). Stessa
// forma per tutti e tre (solo lo slug basta a risolvere la campagna e
// verificarne l'head_master, come `documentUploadInputSchema.campaignSlug`
// per i documenti) — l'autorizzazione concreta vive in
// `src/lib/campaignLogoCoverUpload.ts`/
// `campaignGalleryUpload.ts`.
export const campaignPresentationImageUploadInputSchema = z.object({
  campaignSlug: z.string().trim().min(1),
});

export type CampaignPresentationImageUploadInput = z.infer<
  typeof campaignPresentationImageUploadInputSchema
>;

// Qualità WebP (scala 0-100 di sharp), stesso valore di
// `AVATAR_WEBP_QUALITY` (`src/lib/validations/avatarUpload.ts`): nessuna
// differenza percettiva richiesta per logo/copertina/galleria rispetto agli
// avatar, costante separata solo perché concettualmente un dominio diverso
// (presentazione campagna, non profilo utente/personaggio).
export const CAMPAIGN_IMAGE_WEBP_QUALITY = 82;

// Tetto galleria (T-045): enforced lato autorizzazione upload
// (`authorizeCampaignGalleryUpload`), non a livello DB — `CampaignImage` non
// ha un vincolo di cardinalità nello schema Prisma.
export const MAX_CAMPAIGN_GALLERY_IMAGES = 9;

// Shape di un'immagine di galleria così come restituita da
// `GET /api/campaigns/[campaignSlug]/presentation`.
export const campaignGalleryImageSchema = z.object({
  id: z.number(),
  url: z.string(),
  order: z.number().int(),
});

// Sola lettura, usata dalla pagina admin "Presentazione" (T-045) per
// popolare logo/copertina/descrizione/galleria: nessuna route esistente
// esponeva già questi campi (`GET /api/campaigns/[campaignSlug]` è
// esplicitamente 405, vedi `route.ts`), quindi una nuova route dedicata
// (`GET /api/campaigns/[campaignSlug]/presentation`), stesso precedente di
// `GET .../visibility-conditions` (T-030): additiva, sola lettura, stessa
// guardia head_master delle altre route di gestione campagna.
export const campaignPresentationSchema = z.object({
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  logo: z.string().nullable(),
  cover: z.string().nullable(),
  color: campaignColorEnum,
  texture: campaignTextureEnum,
  images: z.array(campaignGalleryImageSchema),
});

export type CampaignPresentation = z.infer<typeof campaignPresentationSchema>;
