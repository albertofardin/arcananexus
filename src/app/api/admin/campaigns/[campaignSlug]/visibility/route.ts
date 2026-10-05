import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminSectionAccess } from "@/lib/authorization";
import {
  getCampaignBySlug,
  updateCampaignVisibility,
} from "@/lib/repositories/campaign.repository";
import { updateCampaignVisibilitySchema } from "@/lib/validations/campaign";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Toggle visibilità campagna: riservato a Sviluppo Web (isSviluppo), non al
// semplice head_master — è un controllo di "god view" (Amministrazione >
// Gestione Ruoli), non un'impostazione della campagna stessa (vedi
// updateCampaignSchema, che non espone `visibility`).
export const PATCH = requireAdminSectionAccess(
  async (request: Request, context: RouteContext, info) => {
    if (!info.isSviluppo) {
      return apiError(
        403,
        "Solo Sviluppo Web può modificare la visibilità della campagna"
      );
    }

    const { campaignSlug } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = updateCampaignVisibilitySchema.safeParse(body);
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

    const updated = await updateCampaignVisibility(
      prisma,
      campaign.id,
      parsed.data.visibility
    );
    return NextResponse.json(updated);
  }
);
