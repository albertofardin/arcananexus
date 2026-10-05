import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import { rechargeCampaignDowntimePoints } from "@/lib/repositories/character.repository";
import { downtimeRechargeSchema } from "@/lib/validations/character";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Ricarica post-evento (master/head_master): incrementa il saldo punti
// downtime di *ogni* personaggio della campagna dello stesso importo — solo
// quello. Nessun tracciamento di "evento già ricaricato": è il master a
// decidere quando e quanto, stesso principio di fiducia già applicato alla
// modifica manuale del singolo personaggio (`PUT /api/characters/[id]`).
export async function POST(request: NextRequest, { params }: RouteContext) {
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

  const body = await request.json().catch(() => null);
  const parsed = downtimeRechargeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "Dati non validi", parsed.error.flatten());
  }

  try {
    const result = await rechargeCampaignDowntimePoints(
      prisma,
      access.campaign.id,
      parsed.data.amount
    );

    return NextResponse.json({ updatedCount: result.count });
  } catch (error) {
    console.error("Error recharging campaign downtime points:", error);
    return apiError(500, "Internal server error");
  }
}
