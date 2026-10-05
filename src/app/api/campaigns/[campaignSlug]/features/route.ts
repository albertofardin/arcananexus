import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import { getFeatureTypeById } from "@/lib/repositories/featureType.repository";
import {
  createFeature,
  listFeaturesForCampaign,
} from "@/lib/repositories/feature.repository";
import { createFeatureSchema } from "@/lib/validations/feature";
import { getFeatureHandler, UnknownFeatureFunctionError } from "@/lib/features";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Elenca le `Feature` (funzioni del registry attivate) configurate per la
// campagna. Riservata al master di campagna (head_master incluso) o
// super-admin — stessa soglia di `downtime-settings`, così che un master
// possa gestire tutte le feature della campagna senza dover essere
// head_master (T-0xx).
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug } = await params;

  try {
    const access = await requireCampaignMasterBySlug(
      prisma,
      request.headers,
      campaignSlug,
      ARCANA_DOMINE_SLUG
    );
    if (access.ok === false) {
      return apiError(access.status, access.error);
    }

    const features = await listFeaturesForCampaign(prisma, access.campaign.id);

    return NextResponse.json(features);
  } catch (error) {
    console.error("Error fetching features:", error);
    return apiError(500, "Internal server error");
  }
}

// Configura una nuova `Feature` per la campagna: sceglie un `FeatureType` dal
// catalogo (globale, non scopato a campagna) e ne valida `featureData` contro
// il `featureSchema` dell'handler che il registry (`src/lib/features/`) ha
// registrato per il `functionName` di quel `FeatureType` — non contro
// `FeatureType.featureSchema` a DB, che è solo lo snapshot JSON dello stesso
// schema (introspection), non l'origine di verità della validazione (stessa
// scelta di `referenceDataFlags.ts`: gli schemi sono codice).
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug } = await params;

  try {
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
    const parsed = createFeatureSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    const featureType = await getFeatureTypeById(
      prisma,
      parsed.data.featureTypeId
    );
    if (!featureType) {
      return apiError(404, "Tipo di feature non trovato");
    }

    let handlerDefinition;
    try {
      handlerDefinition = getFeatureHandler(featureType.functionName);
    } catch (error) {
      if (error instanceof UnknownFeatureFunctionError) {
        return apiError(
          422,
          "Il tipo di feature non ha una funzione registrata nel codice",
          error.functionName
        );
      }
      throw error;
    }

    const featureDataResult = handlerDefinition.featureSchema.safeParse(
      parsed.data.featureData
    );
    if (!featureDataResult.success) {
      return apiError(
        422,
        "I dati della feature non sono coerenti con il tipo scelto",
        featureDataResult.error.flatten()
      );
    }

    const feature = await createFeature(prisma, {
      campaignId: access.campaign.id,
      featureTypeId: featureType.id,
      featureData: featureDataResult.data as Prisma.InputJsonValue,
    });

    return NextResponse.json(feature, { status: 201 });
  } catch (error) {
    console.error("Error creating feature:", error);
    return apiError(500, "Internal server error");
  }
}
