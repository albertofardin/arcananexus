import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCampaignAdminBySlug } from "@/lib/authorization";
import { updateCampaignLogo } from "@/lib/repositories/campaign.repository";
import { utapi } from "@/lib/uploadthing";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// L'upload/sostituzione del logo passa dal file router UploadThing
// (`campaignLogoUploader`, `src/app/api/uploadthing/core.ts` +
// `src/lib/campaignLogoCoverUpload.ts`, T-045): questa route gestisce solo la
// rimozione, stesso pattern di `api/profile/avatar/route.ts`.
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug } = await params;

  const access = await requireCampaignAdminBySlug(
    prisma,
    request.headers,
    campaignSlug,
    ARCANA_DOMINE_SLUG
  );
  if (access.ok === false) {
    return apiError(access.status, access.error);
  }

  try {
    const previousKey = access.campaign.logoKey;

    await updateCampaignLogo(prisma, access.campaign.id, {
      logo: null,
      logoKey: null,
    });

    // Best-effort: un fallimento nella cleanup del file su UploadThing non
    // deve far fallire la rimozione, il campo è già stato azzerato.
    if (previousKey) {
      try {
        await utapi.deleteFiles(previousKey);
      } catch (error) {
        console.error(
          "Error deleting UploadThing file for campaign logo:",
          error
        );
      }
    }

    return NextResponse.json({ url: null });
  } catch (error) {
    console.error("Error removing campaign logo:", error);
    return apiError(500, "Internal server error");
  }
}
