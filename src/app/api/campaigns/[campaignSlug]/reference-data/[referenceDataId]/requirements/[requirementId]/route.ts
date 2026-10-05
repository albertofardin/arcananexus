import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCampaignAdminBySlug } from "@/lib/authorization";
import { getReferenceDataByIdScoped } from "@/lib/repositories/referenceData.repository";
import {
  deleteDataRequirement,
  getDataRequirementById,
} from "@/lib/repositories/dataRequirement.repository";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{
    campaignSlug: string;
    referenceDataId: string;
    requirementId: string;
  }>;
}

// Rimuove un arco del grafo requisiti. Deve appartenere alla voce indicata
// nel path (`referenceDataId` = `definitionId`) e alla campagna risolta;
// altrimenti 404 (stesso trattamento riservato agli id di altre campagne).
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, referenceDataId, requirementId } = await params;

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

    const parsedReferenceDataId = Number(referenceDataId);
    const parsedRequirementId = Number(requirementId);
    if (
      !Number.isInteger(parsedReferenceDataId) ||
      parsedReferenceDataId <= 0 ||
      !Number.isInteger(parsedRequirementId) ||
      parsedRequirementId <= 0
    ) {
      return apiError(400, "Id non valido");
    }

    const referenceData = await getReferenceDataByIdScoped(
      prisma,
      parsedReferenceDataId,
      access.campaign.id
    );
    if (!referenceData) {
      return apiError(404, "Voce di catalogo non trovata");
    }

    const requirement = await getDataRequirementById(
      prisma,
      parsedRequirementId
    );
    if (!requirement || requirement.definitionId !== referenceData.id) {
      return apiError(404, "Requisito non trovato");
    }

    await deleteDataRequirement(prisma, requirement.id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return apiError(404, "Requisito non trovato");
    }
    console.error("Error deleting data requirement:", error);
    return apiError(500, "Internal server error");
  }
}
