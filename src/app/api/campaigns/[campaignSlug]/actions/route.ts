import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import { getFeatureByFunctionName } from "@/lib/repositories/feature.repository";
import { executeMasterActionSchema } from "@/lib/validations/action";
import {
  createMasterMissiveAction,
  MissiveReceiverNotFoundError,
  MissiveReplyNotAllowedError,
} from "@/lib/features/handlers/missive";
import { ActionDataValidationError } from "@/lib/features";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Dichiara un'`Action` "a nome del master" (T-0xx, missive senza un PG reale
// come mittente): a differenza di `POST .../characters/[characterId]/actions`
// non c'è un personaggio nel path, quindi questa route richiede da sola che
// il chiamante sia master/head_master o super-admin (`requireCampaignMasterBySlug`),
// e accetta solo `functionName: FT_MISSIVE` (`executeMasterActionSchema`): non
// è un varco generico per azioni senza personaggio su altre feature.
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
    const parsed = executeMasterActionSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    const feature = await getFeatureByFunctionName(
      prisma,
      access.campaign.id,
      parsed.data.functionName
    );
    if (!feature) {
      return apiError(404, "Questa azione non è attiva in questa campagna");
    }

    const result = await createMasterMissiveAction(prisma, {
      feature,
      actionData: parsed.data.actionData,
      // QUALE master ha dichiarato l'azione (T-0xx, tab "Inviate"): sempre
      // dalla sessione server-side (`requireCampaignMasterBySlug`), mai dal
      // payload — vedi `Action.authorUserId`.
      masterUserId: access.userId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ActionDataValidationError) {
      return apiError(400, error.message, error.issues);
    }
    if (error instanceof MissiveReceiverNotFoundError) {
      return apiError(404, error.message);
    }
    if (error instanceof MissiveReplyNotAllowedError) {
      return apiError(403, error.message);
    }
    console.error("Error executing master action:", error);
    return apiError(500, "Internal server error");
  }
}
