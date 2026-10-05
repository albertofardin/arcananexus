import type { PrismaClient, Campaign } from "@prisma/client";
import { isUserCampaignAdmin } from "@/lib/authorization";
import {
  getCampaignBySlug,
  updateCampaignCover,
  updateCampaignLogo,
} from "@/lib/repositories/campaign.repository";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";
import { deleteFileBestEffort, type UploadedFile } from "@/lib/uploadFile";

// Logica di autorizzazione/persistenza dell'upload di logo e copertina di
// campagna (T-045), estratta dal file router (`src/app/api/uploadthing/core.ts`)
// perché sia testabile senza toccare l'SDK/il protocollo UploadThing, stesso
// pattern di `src/lib/avatarUpload.ts`/`src/lib/documentUpload.ts`. Logo e
// copertina sono la stessa operazione su due colonne diverse (`field`).

export type CampaignImageField = "logo" | "cover";

export type CampaignLogoCoverUploadContext = {
  campaignId: number;
  campaignSlug: string;
  field: CampaignImageField;
  previousKey: string | null;
};

export type CampaignLogoCoverUploadAuthResult =
  | { ok: true; context: CampaignLogoCoverUploadContext }
  | { ok: false; status: number; message: string };

export interface AuthorizeCampaignLogoCoverUploadParams {
  userId: string | null;
  userEmail: string | null;
  campaignSlug: string;
  field: CampaignImageField;
}

// Autorizza un upload/sostituzione di logo/copertina: solo l'head_master
// della campagna può caricarlo — stessa soglia di `canManageCampaign` in
// `api/campaigns/[campaignSlug]/route.ts` (modificare la presentazione della
// campagna è amministrazione della campagna, non un privilegio più basso
// come per i documenti, T-021).
export async function authorizeCampaignLogoCoverUpload(
  prisma: PrismaClient,
  params: AuthorizeCampaignLogoCoverUploadParams
): Promise<CampaignLogoCoverUploadAuthResult> {
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

  return {
    ok: true,
    context: {
      campaignId: campaign.id,
      campaignSlug: campaign.slug,
      field: params.field,
      previousKey:
        params.field === "logo" ? campaign.logoKey : campaign.coverKey,
    },
  };
}

// Persiste logo/copertina dopo un upload riuscito, poi ripulisce il file
// precedente su UploadThing se ce n'era uno (best-effort, stesso approccio di
// `applyAvatarUpload`/`applyDocumentUpload`). Passa sempre dal repository
// (mai `prisma.*` diretto), come da convenzione "repositories first".
export async function applyCampaignLogoCoverUpload(
  prisma: PrismaClient,
  context: CampaignLogoCoverUploadContext,
  file: UploadedFile,
  deleteFile: (fileKey: string) => Promise<unknown>
): Promise<Campaign> {
  const updated =
    context.field === "logo"
      ? await updateCampaignLogo(prisma, context.campaignId, {
          logo: file.url,
          logoKey: file.key,
        })
      : await updateCampaignCover(prisma, context.campaignId, {
          cover: file.url,
          coverKey: file.key,
        });

  if (context.previousKey && context.previousKey !== file.key) {
    await deleteFileBestEffort(
      deleteFile,
      context.previousKey,
      `previous campaign ${context.field} file`
    );
  }

  return updated;
}
