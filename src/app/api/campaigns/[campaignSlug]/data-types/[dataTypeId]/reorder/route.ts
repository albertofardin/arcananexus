import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import { getDataTypeByIdScoped } from "@/lib/repositories/dataType.repository";
import {
  listReferenceDataIdsForDataType,
  reorderReferenceData,
} from "@/lib/repositories/referenceData.repository";
import { reorderReferenceDataSchema } from "@/lib/validations/referenceData";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; dataTypeId: string }>;
}

// Riordina le voci di un `DataType` (qualunque `renderAs`: files,
// catalog o pages — tutti condividono lo stesso ordinamento server-side
// `order desc`, applicato dalle query di listing in
// `referenceData.repository.ts`) secondo l'ordine scelto dal master (pulsanti
// su/giù): basta essere master della campagna, stesso privilegio già
// concesso per upload/rinomina/eliminazione documenti (T-021). `orderedIds`
// deve coincidere esattamente con l'insieme delle voci esistenti sotto
// questa categoria (nessun id mancante o estraneo), altrimenti una richiesta
// malformata azzererebbe in silenzio l'ordine di voci non incluse.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, dataTypeId } = await params;

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

    const id = Number(dataTypeId);
    if (!Number.isInteger(id) || id <= 0) {
      return apiError(400, "Id categoria non valido");
    }

    const dataType = await getDataTypeByIdScoped(
      prisma,
      id,
      access.campaign.id
    );
    if (!dataType) {
      return apiError(404, "Categoria non trovata");
    }

    const body = await request.json().catch(() => null);
    const parsed = reorderReferenceDataSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    const existingIds = new Set(
      await listReferenceDataIdsForDataType(prisma, dataType.id)
    );
    const providedIds = new Set(parsed.data.orderedIds);
    const sameSet =
      existingIds.size === providedIds.size &&
      [...existingIds].every(entryId => providedIds.has(entryId));
    if (!sameSet) {
      return apiError(
        400,
        "L'elenco non corrisponde alle voci esistenti in questa categoria"
      );
    }

    await reorderReferenceData(prisma, parsed.data.orderedIds);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error reordering reference data:", error);
    return apiError(500, "Internal server error");
  }
}
