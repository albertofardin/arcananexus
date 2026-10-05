import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCampaignAdminBySlug } from "@/lib/authorization";
import {
  deleteReferenceData,
  getReferenceDataByIdScoped,
  getReferenceDataByName,
  updateReferenceData,
} from "@/lib/repositories/referenceData.repository";
import { listIncomingRequirements } from "@/lib/repositories/dataRequirement.repository";
import { countCharacterDataByReferenceData } from "@/lib/repositories/characterData.repository";
import type { UpdateReferenceDataInput } from "@/lib/repositories/types";
import { updateReferenceDataSchema } from "@/lib/validations/referenceData";
import { parseReferenceDataFlags } from "@/lib/validations/referenceDataFlags";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; referenceDataId: string }>;
}

// Risolve campagna (head_master/super-admin) e voce di catalogo, scopata
// alla campagna risolta (via `dataType.campaignId`): un id valido di
// un'altra campagna è trattato come 404, non 403.
async function resolveReferenceData(
  request: NextRequest,
  campaignSlug: string,
  referenceDataIdParam: string
) {
  const access = await requireCampaignAdminBySlug(
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

  const referenceDataId = Number(referenceDataIdParam);
  if (!Number.isInteger(referenceDataId) || referenceDataId <= 0) {
    return {
      ok: false as const,
      response: apiError(400, "Id voce non valido"),
    };
  }

  const referenceData = await getReferenceDataByIdScoped(
    prisma,
    referenceDataId,
    access.campaign.id
  );
  if (!referenceData) {
    return {
      ok: false as const,
      response: apiError(404, "Voce di catalogo non trovata"),
    };
  }

  return { ok: true as const, campaign: access.campaign, referenceData };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, referenceDataId } = await params;

  try {
    const resolved = await resolveReferenceData(
      request,
      campaignSlug,
      referenceDataId
    );
    if (!resolved.ok) return resolved.response;

    return NextResponse.json(resolved.referenceData);
  } catch (error) {
    console.error("Error fetching reference data:", error);
    return apiError(500, "Internal server error");
  }
}

// `dataTypeId` non è modificabile in update (cambierebbe il `kind` — e quindi
// lo schema `flags` applicabile — sotto la voce): resta fissato alla
// creazione.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, referenceDataId } = await params;

  try {
    const resolved = await resolveReferenceData(
      request,
      campaignSlug,
      referenceDataId
    );
    if (!resolved.ok) return resolved.response;

    const body = await request.json().catch(() => null);
    const parsed = updateReferenceDataSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    const { flags: rawFlags, ...rest } = parsed.data;
    const update: UpdateReferenceDataInput = rest;
    if ("flags" in parsed.data) {
      const flagsResult = parseReferenceDataFlags(
        resolved.referenceData.dataType.kind,
        rawFlags
      );
      if (!flagsResult.success) {
        return apiError(
          422,
          "I flag non sono coerenti con la categoria",
          flagsResult.error.flatten()
        );
      }
      // Vedi la nota nella POST (`../route.ts`): cast sicuro, il tipo
      // statico di `ZodTypeAny.data` resta `unknown`.
      update.flags = flagsResult.data as Prisma.InputJsonValue;
    }

    if (parsed.data.name) {
      const existing = await getReferenceDataByName(
        prisma,
        resolved.referenceData.dataTypeId,
        parsed.data.name
      );
      if (existing && existing.id !== resolved.referenceData.id) {
        return apiError(
          409,
          "Esiste già una voce con questo nome in questa categoria"
        );
      }
    }

    const updated = await updateReferenceData(
      prisma,
      resolved.referenceData.id,
      update
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating reference data:", error);
    return apiError(500, "Internal server error");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, referenceDataId } = await params;

  try {
    const resolved = await resolveReferenceData(
      request,
      campaignSlug,
      referenceDataId
    );
    if (!resolved.ok) return resolved.response;

    // Guard applicativo (T-027): la FK `DataRequirement` ha `onDelete:
    // Cascade` (voluto, resta così), quindi senza questo controllo la delete
    // cancellerebbe in silenzio anche gli archi delle voci dipendenti. Blocca
    // con 409 ed elenca chi dipende da questa voce (`requires` o `blocks` in
    // entrata), invece di lasciar fare alla cascade senza avviso.
    const dependents = await listIncomingRequirements(
      prisma,
      resolved.referenceData.id
    );
    if (dependents.length > 0) {
      return apiError(
        409,
        "Impossibile eliminare: altre voci di catalogo dipendono da questa",
        {
          dependents: dependents.map(({ definition }) => ({
            id: definition.id,
            name: definition.name,
          })),
        }
      );
    }

    // Guard applicativo distinto (T-036, ortogonale al guard T-027 sopra): la
    // FK `CharacterData.referenceData` ha anch'essa `onDelete: Cascade`
    // (voluto, resta così), quindi senza questo controllo la delete
    // cancellerebbe in silenzio anche le assegnazioni esistenti ai PG (bug
    // riprodotto su PR #49 — un PG rimasto senza razza). Blocca con 409 e il
    // conteggio delle assegnazioni che bloccano la rimozione.
    // Round 2: conteggio e cancellazione sono nella stessa
    // `prisma.$transaction` (interattiva, `tx` passato a entrambe le
    // funzioni repository) per restringere drasticamente (non eliminare: Postgres
    // resta READ COMMITTED, non SERIALIZABLE/lock espliciti) la finestra TOCTOU
    // tra le due query — senza, una `CharacterData` creata concorrentemente
    // nella finestra riaprirebbe esattamente il bug che questo guard esiste
    // per bloccare.
    const result = await prisma.$transaction(async tx => {
      const assignedCount = await countCharacterDataByReferenceData(
        tx,
        resolved.referenceData.id
      );
      if (assignedCount > 0) {
        return { blocked: true as const, assignedCount };
      }

      await deleteReferenceData(tx, resolved.referenceData.id);
      return { blocked: false as const };
    });

    if (result.blocked) {
      return apiError(
        409,
        "Impossibile eliminare: la voce è assegnata a uno o più personaggi",
        { assignedCount: result.assignedCount }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting reference data:", error);
    return apiError(500, "Internal server error");
  }
}
