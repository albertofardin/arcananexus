import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import { getCharacterInCampaign } from "@/lib/repositories/character.repository";
import { deleteCharacterTalentUnlock } from "@/lib/repositories/characterTalentUnlock.repository";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{
    campaignSlug: string;
    characterId: string;
    referenceDataId: string;
  }>;
}

// Blocca di nuovo (rimuove l'eccezione di sblocco) un talento-catalogo per
// questo personaggio — controparte di `POST .../talents/unlocks`. Nessun
// controllo di esistenza sul talento stesso (a differenza della POST): una
// `deleteMany` su una riga già assente/mai esistita è un no-op idempotente,
// coerente con l'azione "assicurati che non sia sbloccato" più che
// "cancella questa entità specifica".
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const {
    campaignSlug,
    characterId: characterIdParam,
    referenceDataId: referenceDataIdParam,
  } = await params;

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

    const characterId = Number(characterIdParam);
    if (!Number.isInteger(characterId) || characterId <= 0) {
      return apiError(400, "Id personaggio non valido");
    }
    const referenceDataId = Number(referenceDataIdParam);
    if (!Number.isInteger(referenceDataId) || referenceDataId <= 0) {
      return apiError(400, "Id talento non valido");
    }

    const character = await getCharacterInCampaign(
      prisma,
      characterId,
      access.campaign.id
    );
    if (!character) {
      return apiError(404, "Personaggio non trovato");
    }

    await deleteCharacterTalentUnlock(prisma, character.id, referenceDataId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting character talent unlock:", error);
    return apiError(500, "Internal server error");
  }
}
