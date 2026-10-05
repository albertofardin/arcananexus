import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCampaignAdminBySlug } from "@/lib/authorization";
import { getDataTypeByIdScoped } from "@/lib/repositories/dataType.repository";
import {
  createReferenceData,
  getReferenceDataByIdScoped,
  getReferenceDataByName,
  listReferenceDataForCampaign,
} from "@/lib/repositories/referenceData.repository";
import { createDataRequirement } from "@/lib/repositories/dataRequirement.repository";
import { createReferenceDataSchema } from "@/lib/validations/referenceData";
import { parseReferenceDataFlags } from "@/lib/validations/referenceDataFlags";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Elenca le voci di catalogo (`ReferenceData`) della campagna, opzionalmente
// filtrate per categoria (`?dataTypeId=`). Riservata a head_master della
// campagna o super-admin, come le altre route di gestione catalogo (T-016).
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

    const dataTypeIdParam = request.nextUrl.searchParams.get("dataTypeId");
    let dataTypeId: number | undefined;
    if (dataTypeIdParam !== null) {
      dataTypeId = Number(dataTypeIdParam);
      if (!Number.isInteger(dataTypeId) || dataTypeId <= 0) {
        return apiError(400, "Id categoria non valido");
      }
    }

    const referenceData = await listReferenceDataForCampaign(
      prisma,
      access.campaign.id,
      dataTypeId
    );

    return NextResponse.json(referenceData);
  } catch (error) {
    console.error("Error fetching reference data:", error);
    return apiError(500, "Internal server error");
  }
}

// Crea una voce di catalogo. `dataTypeId` deve appartenere alla campagna
// risolta (404 altrimenti); `flags` è validato contro lo schema Zod per-`kind`
// della categoria (T-016) — incoerente col `kind` → 422. Nome univoco
// (case-insensitive) per categoria: nessun vincolo unique a schema su questo
// campo, quindi il controllo di conflitto (409) è a livello applicativo.
// `requirements` (T-0xx, creazione atomica): requisiti in bozza creati in
// transazione insieme alla voce, per poterli configurare già durante la
// creazione invece che solo in un secondo momento dopo il salvataggio.
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
    const parsed = createReferenceDataSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    const { requirements = [], ...entryData } = parsed.data;

    const dataType = await getDataTypeByIdScoped(
      prisma,
      entryData.dataTypeId,
      access.campaign.id
    );
    if (!dataType) {
      return apiError(404, "Categoria non trovata");
    }

    const flagsResult = parseReferenceDataFlags(dataType.kind, entryData.flags);
    if (!flagsResult.success) {
      return apiError(
        422,
        "I flag non sono coerenti con la categoria",
        flagsResult.error.flatten()
      );
    }

    const existing = await getReferenceDataByName(
      prisma,
      dataType.id,
      entryData.name
    );
    if (existing) {
      return apiError(
        409,
        "Esiste già una voce con questo nome in questa categoria"
      );
    }

    // Ogni bersaglio deve esistere nella stessa campagna, verificato PRIMA di
    // aprire la transazione così un id inesistente/di un'altra campagna
    // risponde 404 invece di un rollback generico. Nessun controllo
    // anti-ciclo qui (a differenza dell'endpoint di aggiunta singola,
    // `[referenceDataId]/requirements/route.ts`): la voce non esiste ancora,
    // quindi nessun arco `requires` esistente può già puntare a lei — un
    // ciclo sui suoi requisiti iniziali è impossibile per costruzione.
    for (const requirement of requirements) {
      const target = await getReferenceDataByIdScoped(
        prisma,
        requirement.requiredDefinitionId,
        access.campaign.id
      );
      if (!target) {
        return apiError(
          404,
          `Voce di catalogo richiesta non trovata (id ${requirement.requiredDefinitionId})`
        );
      }
    }

    const referenceData = await prisma.$transaction(async tx => {
      const created = await createReferenceData(tx, {
        ...entryData,
        // Lo schema del `kind` (`referenceDataFlags.ts`) valida `flags` come
        // un oggetto JSON-compatibile; il tipo statico di `ZodTypeAny.data`
        // resta `unknown`, quindi il cast a valle è necessario e sicuro.
        flags: flagsResult.data as Prisma.InputJsonValue,
      });

      for (const requirement of requirements) {
        await createDataRequirement(tx, {
          definitionId: created.id,
          requiredDefinitionId: requirement.requiredDefinitionId,
          type: requirement.type,
          groupId: requirement.groupId,
        });
      }

      return created;
    });

    return NextResponse.json(referenceData, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return apiError(409, "Requisito duplicato tra quelli indicati");
    }
    console.error("Error creating reference data:", error);
    return apiError(500, "Internal server error");
  }
}
