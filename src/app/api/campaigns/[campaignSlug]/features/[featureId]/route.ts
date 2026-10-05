import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import {
  getFeatureByIdScoped,
  updateFeature,
} from "@/lib/repositories/feature.repository";
import { updateFeatureSchema } from "@/lib/validations/feature";
import { getFeatureHandler, UnknownFeatureFunctionError } from "@/lib/features";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; featureId: string }>;
}

// Risolve campagna (master di campagna, head_master incluso, o
// super-admin) e `Feature`, scopata alla campagna risolta: un id valido di
// un'altra campagna è trattato come 404, non 403 — stesso trattamento di
// `data-types/[dataTypeId]` e `reference-data/[referenceDataId]`.
async function resolveFeature(
  request: NextRequest,
  campaignSlug: string,
  featureIdParam: string
) {
  const access = await requireCampaignMasterBySlug(
    prisma,
    request.headers,
    campaignSlug,
    ARCANA_DOMINE_SLUG
  );
  if (access.ok === false) {
    return {
      ok: false as const,
      response: apiError(access.status, access.error),
    };
  }

  const featureId = Number(featureIdParam);
  if (!Number.isInteger(featureId) || featureId <= 0) {
    return {
      ok: false as const,
      response: apiError(400, "Id feature non valido"),
    };
  }

  const feature = await getFeatureByIdScoped(
    prisma,
    featureId,
    access.campaign.id
  );
  if (!feature) {
    return {
      ok: false as const,
      response: apiError(404, "Feature non trovata"),
    };
  }

  return { ok: true as const, campaign: access.campaign, feature };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, featureId } = await params;

  try {
    const resolved = await resolveFeature(request, campaignSlug, featureId);
    if (!resolved.ok) return resolved.response;

    return NextResponse.json(resolved.feature);
  } catch (error) {
    console.error("Error fetching feature:", error);
    return apiError(500, "Internal server error");
  }
}

// `featureTypeId` resta fisso (vedi `updateFeatureSchema`): `featureData`,
// `active` e `paused` sono tutti opzionali, aggiornati solo se presenti nel
// body — `featureData`, quando presente, è ri-validato contro il
// `featureSchema` dell'handler già agganciato a questa `Feature` (stesso
// funzionamento della POST in `../route.ts`); `active` (T-0xx, soft-toggle)
// permette di riattivare/disattivare senza dover rimandare anche
// `featureData`. `paused` (T-0xx, sospensione lato PG): usato dal pannello
// "Progressione della campagna" per sospendere/riprendere l'invio di
// missive/downtime da parte dei PG senza disattivare la feature per lo
// staff — vedi il commento su `Feature.paused` in `schema.prisma`.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, featureId } = await params;

  try {
    const resolved = await resolveFeature(request, campaignSlug, featureId);
    if (!resolved.ok) return resolved.response;

    const body = await request.json().catch(() => null);
    const parsed = updateFeatureSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    let featureData: Prisma.InputJsonValue | undefined;
    if (parsed.data.featureData !== undefined) {
      let handlerDefinition;
      try {
        handlerDefinition = getFeatureHandler(
          resolved.feature.featureType.functionName
        );
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
      featureData = featureDataResult.data as Prisma.InputJsonValue;
    }

    const updated = await updateFeature(prisma, resolved.feature.id, {
      featureData,
      active: parsed.data.active,
      paused: parsed.data.paused,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating feature:", error);
    return apiError(500, "Internal server error");
  }
}

// Soft-delete (T-0xx): `Action.feature` ha `onDelete: Cascade`, quindi un
// hard delete della `Feature` cancellerebbe a cascata lo storico azioni già
// approvate/inviate — inaccettabile per campagne reali. Disattiva soltanto
// (`active: false`): la configurazione resta salvata e riattivabile
// (`createFeature`, upsert-aware, o `PATCH { active: true }`).
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, featureId } = await params;

  try {
    const resolved = await resolveFeature(request, campaignSlug, featureId);
    if (!resolved.ok) return resolved.response;

    const updated = await updateFeature(prisma, resolved.feature.id, {
      active: false,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error deactivating feature:", error);
    return apiError(500, "Internal server error");
  }
}
