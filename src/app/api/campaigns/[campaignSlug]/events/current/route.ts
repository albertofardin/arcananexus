import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import { getCurrentEventForCampaign } from "@/lib/repositories/event.repository";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Evento "corrente" della campagna per la card Evento di admin/progress
// (master/head_master, stessa soglia di `downtime-settings`/`features`):
// `null` quando la campagna non ha ancora nessun evento, così il client
// mostra il placeholder "crea nuovo evento" invece di un link rotto.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug } = await params;

  const access = await requireCampaignMasterBySlug(
    prisma,
    request.headers,
    campaignSlug,
    ARCANA_DOMINE_SLUG
  );
  if (access.ok === false) {
    return apiError(access.status, access.error);
  }

  try {
    const event = await getCurrentEventForCampaign(
      prisma,
      access.campaign.id,
      new Date()
    );

    return NextResponse.json(event);
  } catch (error) {
    console.error("Error fetching current campaign event:", error);
    return apiError(500, "Internal server error");
  }
}
