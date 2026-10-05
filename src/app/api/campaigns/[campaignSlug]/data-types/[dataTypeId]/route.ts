import { NextRequest, NextResponse } from "next/server";
import { DataTypeKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCampaignAdminBySlug } from "@/lib/authorization";
import {
  deleteDataType,
  getDataTypeByIdScoped,
  getDataTypeByName,
  updateDataType,
} from "@/lib/repositories/dataType.repository";
import { countCharacterDataByDataType } from "@/lib/repositories/characterData.repository";
import { countReferenceDataByDataType } from "@/lib/repositories/referenceData.repository";
import {
  dataTypeShapeInvariantSchema,
  updateDataTypeSchema,
} from "@/lib/validations/dataType";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; dataTypeId: string }>;
}

// Risolve campagna (head_master/super-admin) e categoria, scopata alla
// campagna risolta: un id valido di un'altra campagna è trattato come 404,
// non 403, per non far trapelare la sua esistenza altrove.
async function resolveDataType(
  request: NextRequest,
  campaignSlug: string,
  dataTypeIdParam: string
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

  const dataTypeId = Number(dataTypeIdParam);
  if (!Number.isInteger(dataTypeId) || dataTypeId <= 0) {
    return {
      ok: false as const,
      response: apiError(400, "Id categoria non valido"),
    };
  }

  const dataType = await getDataTypeByIdScoped(
    prisma,
    dataTypeId,
    access.campaign.id
  );
  if (!dataType) {
    return {
      ok: false as const,
      response: apiError(404, "Categoria non trovata"),
    };
  }

  return { ok: true as const, campaign: access.campaign, dataType };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, dataTypeId } = await params;

  try {
    const resolved = await resolveDataType(request, campaignSlug, dataTypeId);
    if (!resolved.ok) return resolved.response;

    return NextResponse.json(resolved.dataType);
  } catch (error) {
    console.error("Error fetching data type:", error);
    return apiError(500, "Internal server error");
  }
}

// `kind` è modificabile in update, con due guard applicativi che
// `updateDataTypeSchema` (Zod) non può esprimere da sola perché servono lo
// stato esistente della riga:
// - "Talenti" (`kind: "talent"`) non cambia mai kind, in nessuna delle due
//   direzioni — resta l'unico caso speciale (T-046: sempre presente,
//   esattamente una volta per campagna, guidato da `talents`).
// - qualunque altra `DataType` può cambiare kind solo finché non ha ancora
//   `ReferenceData` figlie: cambiarlo dopo le lascerebbe con `flags`
//   shape-ati per il vecchio `kind` (schema per-`kind`,
//   `validations/referenceDataFlags.ts`) — stessa logica del guard T-036 su
//   DELETE (`countCharacterDataByDataType`), qui sul conteggio "voci di
//   catalogo" invece che "assegnazioni ai PG".
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, dataTypeId } = await params;

  try {
    const resolved = await resolveDataType(request, campaignSlug, dataTypeId);
    if (!resolved.ok) return resolved.response;

    const body = await request.json().catch(() => null);
    const parsed = updateDataTypeSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    if (
      parsed.data.kind !== undefined &&
      parsed.data.kind !== resolved.dataType.kind
    ) {
      if (resolved.dataType.kind === DataTypeKind.talent) {
        return apiError(
          409,
          "Il tipo di dato Talenti è obbligatorio e non può cambiare tipologia"
        );
      }
      const referenceDataCount = await countReferenceDataByDataType(
        prisma,
        resolved.dataType.id
      );
      if (referenceDataCount > 0) {
        return apiError(
          409,
          "Impossibile cambiare tipologia: la categoria ha già voci di catalogo associate",
          { referenceDataCount }
        );
      }
    }

    // Invariante kind/assignability/cardinality (T-035, estesa T-047/T-048):
    // `updateDataTypeSchema` non può validarla da sola (un update parziale
    // può toccare solo uno dei tre campi collegati). Qui si fa il merge con
    // lo stato esistente (incluso il `kind`, se non toccato dal body) e si
    // rivalida sui valori effettivi, prima di persistere.
    const effectiveKind = parsed.data.kind ?? resolved.dataType.kind;
    const effectiveAssignability =
      parsed.data.assignability ?? resolved.dataType.assignability;
    const effectiveCardinality =
      parsed.data.cardinality !== undefined
        ? parsed.data.cardinality
        : resolved.dataType.cardinality;
    const effectiveMandatory =
      parsed.data.mandatory ?? resolved.dataType.mandatory;
    const invariant = dataTypeShapeInvariantSchema.safeParse({
      kind: effectiveKind,
      assignability: effectiveAssignability,
      cardinality: effectiveCardinality,
      mandatory: effectiveMandatory,
    });
    if (!invariant.success) {
      return apiError(400, "Dati non validi", invariant.error.flatten());
    }

    if (parsed.data.name) {
      const existing = await getDataTypeByName(
        prisma,
        resolved.campaign.id,
        parsed.data.name
      );
      if (existing && existing.id !== resolved.dataType.id) {
        return apiError(409, "Esiste già una categoria con questo nome");
      }
    }

    const updated = await updateDataType(
      prisma,
      resolved.dataType.id,
      parsed.data
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating data type:", error);
    return apiError(500, "Internal server error");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, dataTypeId } = await params;

  try {
    const resolved = await resolveDataType(request, campaignSlug, dataTypeId);
    if (!resolved.ok) return resolved.response;

    // Guard applicativo (T-046): "Talenti" è obbligatorio, esattamente uno
    // per campagna (creato automaticamente da `createCampaign`/backfill) —
    // non cancellabile da nessuno, nemmeno da super-admin, altrimenti la
    // campagna resterebbe senza fino al prossimo self-heal difensivo.
    if (resolved.dataType.kind === DataTypeKind.talent) {
      return apiError(
        409,
        "Il tipo di dato Talenti è obbligatorio in ogni campagna"
      );
    }

    // Guard applicativo (T-036): le FK `ReferenceData.dataType` e
    // `CharacterData.dataType` hanno `onDelete: Cascade` (voluto, resta
    // così, stesso approccio del guard T-027 sul grafo `DataRequirement`), e
    // senza questo controllo la delete cancellerebbe a cascata anche le
    // `ReferenceData` della categoria e le `CharacterData` che le
    // assegnavano ai PG, senza alcun avviso (bug riprodotto su PR #49).
    // `countCharacterDataByDataType` conta via la relazione autoritativa
    // `CharacterData.referenceData.dataTypeId` (round 2), quindi copre in un
    // colpo solo *tutte* le voci di questa categoria: se nessuna è
    // assegnata, la cascata delle sue `ReferenceData` resta permessa.
    // Round 2: conteggio e cancellazione sono nella stessa
    // `prisma.$transaction` (interattiva, `tx` passato a entrambe le
    // funzioni repository) per restringere drasticamente (non eliminare: Postgres
    // resta READ COMMITTED, non SERIALIZABLE/lock espliciti) la finestra TOCTOU
    // tra le due query — senza, una `CharacterData` creata concorrentemente
    // nella finestra riaprirebbe esattamente il bug che questo guard esiste
    // per bloccare.
    const result = await prisma.$transaction(async tx => {
      const assignedCount = await countCharacterDataByDataType(
        tx,
        resolved.dataType.id
      );
      if (assignedCount > 0) {
        return { blocked: true as const, assignedCount };
      }

      await deleteDataType(tx, resolved.dataType.id);
      return { blocked: false as const };
    });

    if (result.blocked) {
      return apiError(
        409,
        "Impossibile eliminare: una o più voci di questa categoria sono assegnate a dei personaggi",
        { assignedCount: result.assignedCount }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting data type:", error);
    return apiError(500, "Internal server error");
  }
}
