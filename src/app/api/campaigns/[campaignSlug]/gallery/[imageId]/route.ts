import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCampaignAdminBySlug } from "@/lib/authorization";
import {
  getCampaignImageById,
  removeCampaignImage,
} from "@/lib/repositories/campaign.repository";
import { utapi } from "@/lib/uploadthing";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; imageId: string }>;
}

// Elimina una singola immagine di galleria (T-045): rimuove il file su
// UploadThing (best-effort, come `../../logo/route.ts`) e poi la
// `CampaignImage`. Scoping esplicito su `campaignId` (via
// `getCampaignImageById`) prima di cancellare: un id valido ma di un'altra
// campagna deve restare 404, mai un 204 silenzioso (invariante multi-tenant).
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, imageId } = await params;

  const access = await requireCampaignAdminBySlug(
    prisma,
    request.headers,
    campaignSlug,
    ARCANA_DOMINE_SLUG
  );
  if (access.ok === false) {
    return apiError(access.status, access.error);
  }

  const id = Number(imageId);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(400, "Id immagine non valido");
  }

  try {
    const image = await getCampaignImageById(prisma, id, access.campaign.id);
    if (!image) {
      return apiError(404, "Immagine non trovata");
    }

    await removeCampaignImage(prisma, image.id);

    try {
      await utapi.deleteFiles(image.key);
    } catch (error) {
      console.error(
        "Error deleting UploadThing file for campaign gallery image:",
        error
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error removing campaign gallery image:", error);
    return apiError(500, "Internal server error");
  }
}
