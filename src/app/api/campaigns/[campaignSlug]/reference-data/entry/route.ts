import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import { getDataTypeByIdScoped } from "@/lib/repositories/dataType.repository";
import {
  createReferenceData,
  getReferenceDataByName,
} from "@/lib/repositories/referenceData.repository";
import { createReferenceDataEntrySchema } from "@/lib/validations/referenceData";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Crea una voce di catalogo o una pagina dalla sezione campagna
// (`data/[dataSlug]`, `renderAs = catalog | pages`): a differenza della POST
// generica di `../route.ts` (riservata a head_master, T-016/T-030), qui basta
// essere master della campagna — stesso privilegio già concesso per i
// documenti (T-021, via `document/route.ts`). Non espone `flags`
// (specifico per `kind`, resta dominio dell'amministrazione head_master) né
// i campi di upload documento (gestiti dal flusso UploadThing dedicato):
// per questo motivo rifiuta esplicitamente `renderAs = files`.
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
    const parsed = createReferenceDataEntrySchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    const dataType = await getDataTypeByIdScoped(
      prisma,
      parsed.data.dataTypeId,
      access.campaign.id
    );
    if (!dataType) {
      return apiError(404, "Categoria non trovata");
    }
    if (dataType.renderAs === "files") {
      return apiError(
        400,
        "Questa categoria gestisce documenti: usa il caricamento file"
      );
    }

    const existing = await getReferenceDataByName(
      prisma,
      dataType.id,
      parsed.data.name
    );
    if (existing) {
      return apiError(
        409,
        "Esiste già una voce con questo nome in questa categoria"
      );
    }

    const referenceData = await createReferenceData(prisma, parsed.data);

    return NextResponse.json(referenceData, { status: 201 });
  } catch (error) {
    console.error("Error creating reference data entry:", error);
    return apiError(500, "Internal server error");
  }
}
