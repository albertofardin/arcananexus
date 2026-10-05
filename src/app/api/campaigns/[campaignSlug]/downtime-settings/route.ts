import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import {
  createFeature,
  getFeatureByFunctionName,
  updateFeature,
} from "@/lib/repositories/feature.repository";
import { getFeatureTypeByFunctionName } from "@/lib/repositories/featureType.repository";
import { updateDowntimeSettingsSchema } from "@/lib/validations/feature";
import { FT_DOWNTIME, ensureFeatureTypesRegistered } from "@/lib/features";
import { downtimeFeatureSchema } from "@/lib/features/handlers/downtime";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Impostazioni generali downtime della campagna (T-0xx): una `Feature`
// "contenitore" (`FT_DOWNTIME`, mai eseguibile come azione) che pilota il
// toggle attivo/disattivo mostrato in scheda personaggio
// (`CharacterEditor.tsx`) e il tetto punti per personaggio. GET/PUT
// riservati al master di campagna (`requireCampaignMasterBySlug`) — stessa
// soglia usata da `admin/features` (`features/route.ts`,
// `features/[featureId]/route.ts`, T-0xx): un master (head_master incluso)
// può gestire tutte le feature della campagna, non solo il container
// downtime.
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
    const feature = await getFeatureByFunctionName(
      prisma,
      access.campaign.id,
      FT_DOWNTIME,
      { activeOnly: false }
    );

    if (!feature) {
      return NextResponse.json({
        active: false,
        maxPoints: 0,
        notifyUserIds: [],
        categories: [],
      });
    }

    const config = downtimeFeatureSchema.parse(feature.featureData);
    return NextResponse.json({ active: feature.active, ...config });
  } catch (error) {
    console.error("Error fetching downtime settings:", error);
    return apiError(500, "Internal server error");
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
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
  const parsed = updateDowntimeSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "Dati non validi", parsed.error.flatten());
  }

  try {
    // Auto-provisioning (non più seed-dipendente, vedi `/api/feature-types`):
    // allinea il catalogo prima del lookup, così il container FT_DOWNTIME
    // esiste anche se questa è la prima chiamata dell'ambiente.
    await ensureFeatureTypesRegistered(prisma);
    const featureType = await getFeatureTypeByFunctionName(prisma, FT_DOWNTIME);
    if (!featureType) {
      return apiError(
        500,
        "Il tipo di feature downtime non è presente nel catalogo"
      );
    }

    // `pointBonuses` si gestisce dal pannello progressione, non da questo
    // form: va preservato, altrimenti ogni salvataggio impostazioni lo azzera.
    const existing = await getFeatureByFunctionName(
      prisma,
      access.campaign.id,
      FT_DOWNTIME,
      { activeOnly: false }
    );
    const featureData: Prisma.InputJsonValue = {
      maxPoints: parsed.data.maxPoints,
      notifyUserIds: parsed.data.notifyUserIds,
      categories: parsed.data.categories,
      pointBonuses: existing
        ? downtimeFeatureSchema.parse(existing.featureData).pointBonuses
        : [],
    };

    // `createFeature` è upsert-aware (T-0xx): riusa la `Feature` esistente
    // (anche disattivata) per la coppia `(featureType, campagna)` invece di
    // provare a duplicarla — poi il flag `active` richiesto è applicato con
    // un secondo `updateFeature`, dato che `createFeature` la forza sempre a
    // `true`.
    const feature = await createFeature(prisma, {
      campaignId: access.campaign.id,
      featureTypeId: featureType.id,
      featureData,
    });

    const updated = parsed.data.active
      ? feature
      : await updateFeature(prisma, feature.id, { active: false });

    return NextResponse.json({
      active: updated.active,
      ...downtimeFeatureSchema.parse(updated.featureData),
    });
  } catch (error) {
    console.error("Error updating downtime settings:", error);
    return apiError(500, "Internal server error");
  }
}
