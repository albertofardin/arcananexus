import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import {
  getReferenceDataByIdScoped,
  getReferenceDataByName,
  updateReferenceData,
} from "@/lib/repositories/referenceData.repository";
import { updateReferenceDataEntrySchema } from "@/lib/validations/referenceData";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; referenceDataId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, referenceDataId } = await params;

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

    const id = Number(referenceDataId);
    if (!Number.isInteger(id) || id <= 0) {
      return apiError(400, "Id voce non valido");
    }

    const referenceData = await getReferenceDataByIdScoped(
      prisma,
      id,
      access.campaign.id
    );
    if (!referenceData) {
      return apiError(404, "Voce non trovata");
    }

    const body = await request.json().catch(() => null);
    const parsed = updateReferenceDataEntrySchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    if (parsed.data.name) {
      const existing = await getReferenceDataByName(
        prisma,
        referenceData.dataTypeId,
        parsed.data.name
      );
      if (existing && existing.id !== referenceData.id) {
        return apiError(
          409,
          "Esiste già una voce con questo nome in questa categoria"
        );
      }
    }

    const updated = await updateReferenceData(prisma, referenceData.id, {
      name: parsed.data.name,
      description: parsed.data.description,
      visibility: parsed.data.visibility,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating reference data entry:", error);
    return apiError(500, "Internal server error");
  }
}
