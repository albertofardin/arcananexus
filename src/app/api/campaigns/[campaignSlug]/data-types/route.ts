import { NextRequest, NextResponse } from "next/server";
import { DataTypeKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCampaignAdminBySlug } from "@/lib/authorization";
import {
  createDataType,
  getDataTypeByName,
  listDataTypes,
} from "@/lib/repositories/dataType.repository";
import { getFeatureByFunctionName } from "@/lib/repositories/feature.repository";
import { FT_PROGRESS } from "@/lib/features/featuresName";
import { progressFeatureSchema } from "@/lib/features/handlers/progress";
import { createDataTypeSchema } from "@/lib/validations/dataType";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Elenca le categorie (`DataType`) della campagna. Come le altre route di
// gestione catalogo (T-016), riservata a head_master della campagna o
// super-admin: `flags` sono dati di gestione, non pubblici (la vista
// filtrata per i giocatori arriva con T-020/T-026).
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug } = await params;

  try {
    const access = await requireCampaignAdminBySlug(
      prisma,
      request.headers,
      campaignSlug,
      ARCANA_DOMINE_SLUG
    );
    if (access.ok === false) {
      return apiError(access.status, access.error);
    }

    const includeCount =
      request.nextUrl.searchParams.get("includeCount") === "true";
    const dataTypes = await listDataTypes(
      prisma,
      access.campaign.id,
      includeCount
    );

    // "Talenti" (kind: talent) dipende dal sotto-toggle `talentsEnabled` di
    // "Progressione PG" (T-0xx, fusione — talenti non ha più una propria
    // Feature): se disabilitato, la categoria sparisce anche dalla sua
    // stessa gestione catalogo — riattivarla dall'admin delle feature è
    // l'unico modo per tornare a vederla e popolarla qui. Il lookup extra si
    // fa solo se la campagna ha davvero una categoria talent da
    // eventualmente nascondere.
    const hasTalentDataType = dataTypes.some(
      dataType => dataType.kind === DataTypeKind.talent
    );
    const progressFeature = hasTalentDataType
      ? await getFeatureByFunctionName(prisma, access.campaign.id, FT_PROGRESS)
      : null;
    const talentsEnabled =
      !!progressFeature &&
      progressFeatureSchema.parse(progressFeature.featureData).talentsEnabled;
    const visibleDataTypes =
      hasTalentDataType && !talentsEnabled
        ? dataTypes.filter(dataType => dataType.kind !== DataTypeKind.talent)
        : dataTypes;

    return NextResponse.json(visibleDataTypes);
  } catch (error) {
    console.error("Error fetching data types:", error);
    return apiError(500, "Internal server error");
  }
}

// Crea una nuova categoria di dato. Il nome è univoco (case-insensitive) per
// campagna: nessun vincolo unique a schema su questo campo, quindi il
// controllo di conflitto (409) è a livello applicativo.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug } = await params;

  try {
    const access = await requireCampaignAdminBySlug(
      prisma,
      request.headers,
      campaignSlug,
      ARCANA_DOMINE_SLUG
    );
    if (access.ok === false) {
      return apiError(access.status, access.error);
    }

    const body = await request.json().catch(() => null);
    const parsed = createDataTypeSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    const existing = await getDataTypeByName(
      prisma,
      access.campaign.id,
      parsed.data.name
    );
    if (existing) {
      return apiError(409, "Esiste già una categoria con questo nome");
    }

    const dataType = await createDataType(prisma, {
      ...parsed.data,
      campaignId: access.campaign.id,
    });

    return NextResponse.json(dataType, { status: 201 });
  } catch (error) {
    console.error("Error creating data type:", error);
    return apiError(500, "Internal server error");
  }
}
