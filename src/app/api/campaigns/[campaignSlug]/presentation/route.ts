import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCampaignSupporterBySlug } from "@/lib/authorization";
import { listCampaignImages } from "@/lib/repositories/campaign.repository";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";
import type { CampaignPresentation } from "@/lib/validations/campaignPresentationUpload";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Sola lettura per la pagina admin "Presentazione": logo, copertina,
// descrizione e galleria della campagna. Non esisteva prima una route che
// esponesse questi campi (`GET /api/campaigns/[campaignSlug]` è
// esplicitamente 405, vedi `../route.ts`). Qualunque membro dello staff
// della campagna (supporter+) può leggerla: la pagina è visitabile in sola
// lettura da master/supporter, mentre resta riservata all'head_master (o al
// super-admin) la sua modifica — PUT campagna, upload/delete logo/copertina/
// galleria restano dietro la guardia head_master.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug } = await params;

  try {
    const access = await requireCampaignSupporterBySlug(
      prisma,
      request.headers,
      campaignSlug,
      ARCANA_DOMINE_SLUG
    );
    if (access.ok === false) {
      return apiError(access.status, access.error);
    }

    const images = await listCampaignImages(prisma, access.campaign.id);

    const body: CampaignPresentation = {
      name: access.campaign.name,
      slug: access.campaign.slug,
      description: access.campaign.description,
      logo: access.campaign.logo,
      cover: access.campaign.cover,
      color: access.campaign.color,
      texture: access.campaign.texture,
      images: images.map(image => ({
        id: image.id,
        url: image.url,
        order: image.order,
      })),
    };

    return NextResponse.json(body);
  } catch (error) {
    console.error("Error fetching campaign presentation:", error);
    return apiError(500, "Internal server error");
  }
}
