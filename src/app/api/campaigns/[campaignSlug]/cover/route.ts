import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCampaignAdminBySlug } from "@/lib/authorization";
import { updateCampaignCover } from "@/lib/repositories/campaign.repository";
import { utapi } from "@/lib/uploadthing";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Gemella di `../logo/route.ts`, per l'immagine di copertina (T-045).
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
    const previousKey = access.campaign.coverKey;

    await updateCampaignCover(prisma, access.campaign.id, {
      cover: null,
      coverKey: null,
    });

    if (previousKey) {
      try {
        await utapi.deleteFiles(previousKey);
      } catch (error) {
        console.error(
          "Error deleting UploadThing file for campaign cover:",
          error
        );
      }
    }

    return NextResponse.json({ url: null });
  } catch (error) {
    console.error("Error removing campaign cover:", error);
    return apiError(500, "Internal server error");
  }
}
