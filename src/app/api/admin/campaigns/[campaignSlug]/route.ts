import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminSectionAccess } from "@/lib/authorization";
import {
  getCampaignBySlug,
  updateCampaign,
  deleteCampaign,
} from "@/lib/repositories/campaign.repository";
import { updateCampaignSchema } from "@/lib/validations/campaign";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Modifica ed eliminazione campagna dalla vista "god view" di Amministrazione
// > Gestione Campagne: riservate a Sviluppo Web (isSviluppo), non al semplice
// head_master della campagna — quella resta la route `/api/campaigns/[campaignSlug]`
// (PUT/DELETE), pensata per le impostazioni della campagna dal suo staff.
export const PUT = requireAdminSectionAccess(
  async (request: Request, context: RouteContext, info) => {
    if (!info.isSviluppo) {
      return apiError(
        403,
        "Solo Sviluppo Web può modificare le campagne da qui"
      );
    }

    const { campaignSlug } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = updateCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    const campaign = await getCampaignBySlug(
      prisma,
      campaignSlug,
      ARCANA_DOMINE_SLUG
    );
    if (!campaign) {
      return apiError(404, "Campagna non trovata");
    }

    try {
      const updated = await updateCampaign(prisma, campaign.id, parsed.data);
      return NextResponse.json(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return apiError(
          409,
          "Esiste già una campagna con questo slug in questa organizzazione"
        );
      }
      console.error("Error updating campaign:", error);
      return apiError(500, "Internal server error");
    }
  }
);

export const DELETE = requireAdminSectionAccess(
  async (_request: Request, context: RouteContext, info) => {
    if (!info.isSviluppo) {
      return apiError(
        403,
        "Solo Sviluppo Web può eliminare le campagne da qui"
      );
    }

    const { campaignSlug } = await context.params;
    const campaign = await getCampaignBySlug(
      prisma,
      campaignSlug,
      ARCANA_DOMINE_SLUG
    );
    if (!campaign) {
      return apiError(404, "Campagna non trovata");
    }

    try {
      await deleteCampaign(prisma, campaign.id);
      return new NextResponse(null, { status: 204 });
    } catch (error) {
      console.error("Error deleting campaign:", error);
      return apiError(500, "Internal server error");
    }
  }
);
