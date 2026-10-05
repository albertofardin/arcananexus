import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import { getFeatureByFunctionName } from "@/lib/repositories/feature.repository";
import { resetCampaignPointsForActiveCharacters } from "@/lib/repositories/character.repository";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";
import type { PointBonus } from "@/lib/features/pointBonus";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Reset punti (master/head_master): downtime-reset e missive-reset riportano
// il saldo di ogni personaggio attivo al massimo configurato nella
// rispettiva feature — stessa logica, cambia solo la feature/il campo.
export function resetFeaturePoints<Schema extends z.ZodTypeAny>({
  functionName,
  schema,
  field,
  getMax,
  getBonuses,
  notConfiguredMessage,
  logLabel,
}: {
  functionName: string;
  schema: Schema;
  field: "downtimePoints" | "missivePoints";
  getMax: (data: z.infer<Schema>) => number;
  getBonuses: (data: z.infer<Schema>) => PointBonus[];
  notConfiguredMessage: string;
  logLabel: string;
}) {
  return async function POST(request: NextRequest, { params }: RouteContext) {
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

    const feature = await getFeatureByFunctionName(
      prisma,
      access.campaign.id,
      functionName
    );
    if (!feature) {
      return apiError(404, notConfiguredMessage);
    }

    const data = schema.parse(feature.featureData);
    const maxPoints = getMax(data);

    try {
      const result = await resetCampaignPointsForActiveCharacters(
        prisma,
        access.campaign.id,
        field,
        maxPoints,
        getBonuses(data)
      );

      return NextResponse.json({
        updatedCount: result.count,
        value: maxPoints,
      });
    } catch (error) {
      console.error(`Error resetting campaign ${logLabel} points:`, error);
      return apiError(500, "Internal server error");
    }
  };
}
