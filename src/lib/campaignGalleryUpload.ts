import type { PrismaClient, CampaignImage } from "@prisma/client";
import { isUserCampaignAdmin } from "@/lib/authorization";
import {
  getCampaignBySlug,
  addCampaignImage,
  countCampaignImages,
} from "@/lib/repositories/campaign.repository";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";
import { MAX_CAMPAIGN_GALLERY_IMAGES } from "@/lib/validations/campaignPresentationUpload";
import { type UploadedFile } from "@/lib/uploadFile";

// Gemello di `src/lib/campaignLogoCoverUpload.ts`, per
// la galleria di immagini di presentazione (T-045). A differenza di
// logo/copertina (un solo file, sostituito), qui ogni upload *aggiunge* una
// `CampaignImage`: l'autorizzazione deve quindi anche far rispettare il
// tetto (`MAX_CAMPAIGN_GALLERY_IMAGES`), contando le immagini già presenti
// **più** quelle del batch appena inviato (`newFilesCount`, dal `files`
// dell'array passato al `.middleware()` di UploadThing — un batch può
// contenere più file in un'unica selezione).

export type CampaignGalleryUploadContext = {
  campaignId: number;
  campaignSlug: string;
};

export type CampaignGalleryUploadAuthResult =
  | { ok: true; context: CampaignGalleryUploadContext }
  | { ok: false; status: number; message: string };

export interface AuthorizeCampaignGalleryUploadParams {
  userId: string | null;
  userEmail: string | null;
  campaignSlug: string;
  newFilesCount: number;
}

export async function authorizeCampaignGalleryUpload(
  prisma: PrismaClient,
  params: AuthorizeCampaignGalleryUploadParams
): Promise<CampaignGalleryUploadAuthResult> {
  if (!params.userId || !params.userEmail) {
    return { ok: false, status: 401, message: "Non autenticato" };
  }

  const campaign = await getCampaignBySlug(
    prisma,
    params.campaignSlug,
    ARCANA_DOMINE_SLUG
  );
  if (!campaign) {
    return { ok: false, status: 404, message: "Campagna non trovata" };
  }

  const isAdmin = await isUserCampaignAdmin(prisma, params.userId, campaign.id);
  if (!isAdmin) {
    return { ok: false, status: 403, message: "Permessi insufficienti" };
  }

  const existingCount = await countCampaignImages(prisma, campaign.id);
  if (existingCount + params.newFilesCount > MAX_CAMPAIGN_GALLERY_IMAGES) {
    return {
      ok: false,
      status: 400,
      message: `La galleria può contenere al massimo ${MAX_CAMPAIGN_GALLERY_IMAGES} immagini`,
    };
  }

  return {
    ok: true,
    context: { campaignId: campaign.id, campaignSlug: campaign.slug },
  };
}

// `onUploadComplete` di UploadThing viene invocato una volta per ogni file
// del batch: ogni chiamata aggiunge una `CampaignImage` in coda (`order` =
// conteggio corrente al momento dell'inserimento). Nessuna cleanup di file
// precedenti (a differenza di logo/copertina): è sempre un'aggiunta, non una
// sostituzione — la rimozione passa dalla route `DELETE
// /api/campaigns/[campaignSlug]/gallery/[imageId]`.
export async function applyCampaignGalleryUpload(
  prisma: PrismaClient,
  context: CampaignGalleryUploadContext,
  file: UploadedFile
): Promise<CampaignImage> {
  const order = await countCampaignImages(prisma, context.campaignId);
  return addCampaignImage(prisma, context.campaignId, {
    campaignId: context.campaignId,
    url: file.url,
    key: file.key,
    order,
  });
}
