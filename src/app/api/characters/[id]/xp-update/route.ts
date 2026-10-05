import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isUserCampaignMaster } from "@/lib/authorization";
import { getCharacterOwnership } from "@/lib/repositories/character.repository";
import { updateXp } from "@/lib/services/xp.service";
import { characterXpUpdateSchema } from "@/lib/validations/character";
import { apiError } from "@/lib/api-helpers";

// Aggiornamento manuale del saldo XP di un singolo PG già esistente
// (master, T-0xx): stesso servizio (`xp.service.updateXp`) usato in
// creazione PG e nell'assegnazione bulk admin, qui applicato al singolo
// personaggio dalla scheda (`CharacterEditor.tsx`). Riservato al
// master/head_master della campagna del PG — soglia più alta di
// `PUT /api/characters/[id]` (helper+), coerente con `xp-grant`.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return apiError(401, "Non autenticato");
  }

  const { id } = await context.params;
  const characterId = Number(id);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    return apiError(400, "Id personaggio non valido");
  }

  const body = await request.json().catch(() => null);
  const parsed = characterXpUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "Dati non validi", parsed.error.flatten());
  }

  try {
    const character = await getCharacterOwnership(prisma, characterId);
    if (!character) {
      return apiError(404, "Personaggio non trovato");
    }

    const isMasterOrAbove = await isUserCampaignMaster(
      prisma,
      session.user.id,
      character.campaignId
    );
    if (!isMasterOrAbove) {
      return apiError(
        403,
        "Permessi insufficienti",
        "Solo lo staff della campagna (master o superiore) può aggiornare gli XP"
      );
    }

    const transaction = await updateXp(prisma, character, parsed.data.amount, {
      updatedByUserId: session.user.id,
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    console.error("Error updating character XP:", error);
    return apiError(500, "Internal server error");
  }
}
