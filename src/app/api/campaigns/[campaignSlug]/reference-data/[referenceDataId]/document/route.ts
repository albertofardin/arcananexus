import { NextRequest, NextResponse } from "next/server";
import { DataTypeRender } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import {
  deleteReferenceData,
  getReferenceDataByIdScoped,
} from "@/lib/repositories/referenceData.repository";
import { utapi } from "@/lib/uploadthing";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; referenceDataId: string }>;
}

// Elimina un documento (T-021): rimuove il file su UploadThing (best-effort,
// come la cleanup in `applyDocumentUpload`) e poi la `ReferenceData`. A
// differenza della DELETE generica di catalogo (`../route.ts`, riservata a
// head_master), qui basta essere master della campagna — coerente con
// l'upload, che è lo stesso privilegio (T-021: "carica/sostituisce/elimina").
// Riservata alle voci del `DataType` `renderAs = files`: per tutte le
// altre risponde 404, la delete di catalogo generica resta l'unica via.
export async function DELETE(request: NextRequest, { params }: RouteContext) {
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
      return apiError(400, "Id documento non valido");
    }

    const referenceData = await getReferenceDataByIdScoped(
      prisma,
      id,
      access.campaign.id
    );
    if (
      !referenceData ||
      referenceData.dataType.renderAs !== DataTypeRender.files
    ) {
      return apiError(404, "Documento non trovato");
    }

    if (referenceData.fileKey) {
      try {
        await utapi.deleteFiles(referenceData.fileKey);
      } catch (error) {
        console.error("Error deleting UploadThing file for document:", error);
      }
    }

    await deleteReferenceData(prisma, referenceData.id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting document:", error);
    return apiError(500, "Internal server error");
  }
}
