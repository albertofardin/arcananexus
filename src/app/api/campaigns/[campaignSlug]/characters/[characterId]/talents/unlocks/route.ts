import { NextRequest, NextResponse } from "next/server";
import { DataTypeKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import { getCharacterInCampaign } from "@/lib/repositories/character.repository";
import { getReferenceDataByIdScoped } from "@/lib/repositories/referenceData.repository";
import { upsertCharacterTalentUnlock } from "@/lib/repositories/characterTalentUnlock.repository";
import { createCharacterTalentUnlockSchema } from "@/lib/validations/characterTalentUnlock";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; characterId: string }>;
}

// Sblocca un talento-catalogo altrimenti `hidden` per UN personaggio (T-0xx,
// occhio master in `ModalTalents`): non assegna nulla (nessuna
// `CharacterData` creata, nessun costo XP addebitato) — apre solo la
// visibilità del catalogo apprendibile per questo personaggio, il giocatore
// dovrà comunque "Aggiungere" e pagare XP di tasca sua. Stessa soglia di
// autorizzazione del "reveal" su `CharacterData`
// (`requireCampaignMasterBySlug`, .../data/[characterDataId]).
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, characterId: characterIdParam } = await params;

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

    const body = await request.json().catch(() => null);
    const parsed = createCharacterTalentUnlockSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    const character = await getCharacterInCampaign(
      prisma,
      characterId,
      access.campaign.id
    );
    if (!character) {
      return apiError(404, "Personaggio non trovato");
    }

    const referenceData = await getReferenceDataByIdScoped(
      prisma,
      parsed.data.referenceDataId,
      access.campaign.id
    );
    if (!referenceData || referenceData.dataType.kind !== DataTypeKind.talent) {
      return apiError(404, "Talento non trovato");
    }

    const unlock = await upsertCharacterTalentUnlock(prisma, {
      characterId: character.id,
      referenceDataId: referenceData.id,
      unlockedById: access.userId,
    });

    return NextResponse.json({ unlock }, { status: 201 });
  } catch (error) {
    console.error("Error creating character talent unlock:", error);
    return apiError(500, "Internal server error");
  }
}
