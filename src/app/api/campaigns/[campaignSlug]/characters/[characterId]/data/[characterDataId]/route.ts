import { NextRequest, NextResponse } from "next/server";
import { DataTypeKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import {
  getCharacterInCampaign,
  revokeCharacterPointBonus,
} from "@/lib/repositories/character.repository";
import {
  deleteCharacterDataById,
  getCharacterDataByIdScoped,
  updateCharacterData,
} from "@/lib/repositories/characterData.repository";
import { updateCharacterDataVisibilitySchema } from "@/lib/validations/characterData";
import { recordTalentRemoval } from "@/lib/services/xp.service";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{
    campaignSlug: string;
    characterId: string;
    characterDataId: string;
  }>;
}

// Cambia la `visibility` di una `CharacterData` già assegnata (T-038,
// "azione di reveal" del master): riservato al master di campagna
// (head_master ⊇ master) o super-admin, stessa soglia già usata da T-018 per
// la creazione PG per conto terzi (`requireCampaignMasterBySlug`) — nessun
// percorso esistente permetteva finora di cambiare la visibilità dopo la
// creazione (diagnosi completa nel task file).
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const {
    campaignSlug,
    characterId: characterIdParam,
    characterDataId: characterDataIdParam,
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
    const characterDataId = Number(characterDataIdParam);
    if (!Number.isInteger(characterDataId) || characterDataId <= 0) {
      return apiError(400, "Id dato personaggio non valido");
    }

    const body = await request.json().catch(() => null);
    const parsed = updateCharacterDataVisibilitySchema.safeParse(body);
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

    const characterData = await getCharacterDataByIdScoped(
      prisma,
      characterDataId,
      characterId,
      access.campaign.id
    );
    if (!characterData) {
      return apiError(404, "Dato personaggio non trovato");
    }

    const updated = await updateCharacterData(prisma, characterDataId, {
      visibility: parsed.data.visibility,
    });

    return NextResponse.json({ characterData: updated });
  } catch (error) {
    console.error("Error updating character data visibility:", error);
    return apiError(500, "Internal server error");
  }
}

// Rimuove una `CharacterData` già assegnata (T-0xx, controparte "remove" del
// gruppo `multi` nella scheda PG): a differenza di `single` — che si
// autosostituisce via POST (`assignReferenceDataToCharacter`, cardinalità
// `single`) — un `DataType` `multi` accumula più istanze e nessuna route
// esistente permetteva finora di toglierne una. Stessa soglia di
// autorizzazione del PATCH sopra (master/head_master o super-admin,
// `requireCampaignMasterBySlug`): solo lo staff corregge le assegnazioni di
// catalogo dopo la creazione.
//
// Talento (T-0xx, bottone "Elimina" in "Talenti acquisiti"): niente
// rimborso XP (il costo speso resta speso), ma la rimozione va comunque
// tracciata in cronologia — altrimenti un talento sparirebbe dalla scheda
// senza lasciare traccia di chi/quando l'ha tolto. Registra quindi una
// `XpTransaction` a importo `0` con `reason: removal` (`recordTalentRemoval`,
// dedicato e distinto da `update` per non confondersi in cronologia con un
// aggiustamento manuale del saldo) nella stessa transazione della
// cancellazione, solo quando `dataType.kind === talent` (le origini non
// hanno un concetto di "costo" da annotare).
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const {
    campaignSlug,
    characterId: characterIdParam,
    characterDataId: characterDataIdParam,
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
    const characterDataId = Number(characterDataIdParam);
    if (!Number.isInteger(characterDataId) || characterDataId <= 0) {
      return apiError(400, "Id dato personaggio non valido");
    }

    const character = await getCharacterInCampaign(
      prisma,
      characterId,
      access.campaign.id
    );
    if (!character) {
      return apiError(404, "Personaggio non trovato");
    }

    const characterData = await getCharacterDataByIdScoped(
      prisma,
      characterDataId,
      characterId,
      access.campaign.id
    );
    if (!characterData) {
      return apiError(404, "Dato personaggio non trovato");
    }

    const isTalent = characterData.dataType.kind === DataTypeKind.talent;
    const flags = characterData.referenceData.flags as {
      isMissivePointBonus?: boolean;
      isDowntimePointBonus?: boolean;
    } | null;

    await prisma.$transaction(async tx => {
      await deleteCharacterDataById(tx, characterDataId);
      if (isTalent) {
        await recordTalentRemoval(
          tx,
          character,
          characterData.referenceDataId,
          {
            updatedByUserId: access.userId,
          }
        );
        // Controparte di `grantCharacterPointBonus` (assegnazione, vedi
        // `characterData.service.ts`): rimuovere un talento con questi flag
        // toglie il punto/massimale guadagnati, altrimenti resterebbero
        // fantasma dopo un reset punti.
        if (flags?.isMissivePointBonus) {
          await revokeCharacterPointBonus(tx, characterId, "missivePoints");
        }
        if (flags?.isDowntimePointBonus) {
          await revokeCharacterPointBonus(tx, characterId, "downtimePoints");
        }
      }
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting character data:", error);
    return apiError(500, "Internal server error");
  }
}
