import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCampaignAdminBySlug } from "@/lib/authorization";
import { getReferenceDataByIdScoped } from "@/lib/repositories/referenceData.repository";
import {
  createDataRequirement,
  listIncomingRequirements,
  listOutgoingRequirements,
  wouldCreateRequirementCycle,
  RequirementDepthExceededError,
} from "@/lib/repositories/dataRequirement.repository";
import { createDataRequirementSchema } from "@/lib/validations/dataRequirement";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; referenceDataId: string }>;
}

// Risolve campagna (head_master/super-admin) e voce di catalogo di origine
// (`referenceDataId` = `definitionId` degli archi), scopata alla campagna
// risolta.
async function resolveContext(
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

  return {
    ok: true as const,
    campaignId: access.campaign.id,
    referenceData,
  };
}

// Elenca il grafo dei requisiti in uscita (ciò che questa voce
// richiede/blocca) e in entrata (voci che richiedono/bloccano questa).
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, referenceDataId } = await params;

  try {
    const resolved = await resolveContext(
      request,
      campaignSlug,
      referenceDataId
    );
    if (!resolved.ok) return resolved.response;

    const [requires, requiredBy] = await Promise.all([
      listOutgoingRequirements(prisma, resolved.referenceData.id),
      listIncomingRequirements(prisma, resolved.referenceData.id),
    ]);

    return NextResponse.json({ requires, requiredBy });
  } catch (error) {
    console.error("Error fetching data requirements:", error);
    return apiError(500, "Internal server error");
  }
}

// Crea un arco del grafo requisiti (`requires`/`blocks`/`visibleWith`/
// `grants`). Invarianti: la voce richiesta deve appartenere alla stessa
// campagna (404 altrimenti, coerente col non far trapelare l'esistenza di
// voci di altre campagne); niente auto-requisiti; niente duplicati (409,
// vincolo unique a schema su definitionId+requiredDefinitionId+type); check
// anti-ciclo best-effort sui grafi direzionali `requires`/`grants` (409 se lo
// chiuderebbe — `blocks`/`visibleWith` non sono dipendenze direzionali ai
// fini del ciclo, nessun check).
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, referenceDataId } = await params;

  try {
    const resolved = await resolveContext(
      request,
      campaignSlug,
      referenceDataId
    );
    if (!resolved.ok) return resolved.response;

    const body = await request.json().catch(() => null);
    const parsed = createDataRequirementSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    const { requiredDefinitionId, type, groupId } = parsed.data;

    if (requiredDefinitionId === resolved.referenceData.id) {
      return apiError(400, "Una voce non può richiedere se stessa");
    }

    const requiredDefinition = await getReferenceDataByIdScoped(
      prisma,
      requiredDefinitionId,
      resolved.campaignId
    );
    if (!requiredDefinition) {
      return apiError(404, "Voce di catalogo richiesta non trovata");
    }

    if (type === "requires" || type === "grants") {
      const wouldCycle = await wouldCreateRequirementCycle(
        prisma,
        resolved.referenceData.id,
        requiredDefinitionId,
        type
      );
      if (wouldCycle) {
        return apiError(409, "Il requisito genererebbe un ciclo");
      }
    }

    const requirement = await createDataRequirement(prisma, {
      definitionId: resolved.referenceData.id,
      requiredDefinitionId,
      type,
      groupId,
    });

    return NextResponse.json(requirement, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return apiError(409, "Requisito già esistente");
    }
    // Tetto di profondità del BFS anti-ciclo superato (T-027, review round 1):
    // stesso path del check anti-ciclo appena sopra, che sul ciclo rilevato
    // risponde già 409 — qui mappiamo a un 4xx di dominio anziché lasciarla
    // ricadere nel fallback 500 generico, per coerenza con l'esito "atteso"
    // dello stesso controllo.
    if (error instanceof RequirementDepthExceededError) {
      return apiError(422, error.message);
    }
    console.error("Error creating data requirement:", error);
    return apiError(500, "Internal server error");
  }
}
