import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isUserCampaignHelper } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { getCharacterInCampaign } from "@/lib/repositories/character.repository";
import { getCharacterAcquirableTalents } from "@/lib/services/characterTalents.service";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; characterId: string }>;
}

// Talenti acquisibili + grafo requisiti di UN personaggio (T-0xx): dietro un
// fetch on-demand, invocato solo quando il giocatore apre la modale
// "Apprendi talenti"/"Talenti acquisiti" di `CharacterEditor` — non più nel
// payload eager di `characters/[id]/page.tsx` (vedi
// `characterEditor.service.ts`). Aperta a proprietario o staff, come la
// guardia di `characters/[id]/layout.tsx`; la vista "master" (talenti
// `assignability: masterOnly` inclusi) è concessa a qualunque ruolo di staff
// (supporter incluso), non solo master/head_master — coerente con
// `admin/characters/[id]/page.tsx`, che forza la vista master per
// qualunque membro dello staff, e con il fatto che lo staff ha comunque
// accesso al catalogo completo altrove (gestione dati campagna).
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, characterId: characterIdParam } = await params;

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return apiError(401, "Non autenticato");
  }

  const characterId = Number(characterIdParam);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    return apiError(400, "Id personaggio non valido");
  }

  try {
    const campaign = await getCampaignBySlug(
      prisma,
      campaignSlug,
      ARCANA_DOMINE_SLUG
    );
    if (!campaign) {
      return apiError(404, "Campagna non trovata");
    }

    const character = await getCharacterInCampaign(
      prisma,
      characterId,
      campaign.id
    );
    if (!character) {
      return apiError(404, "Personaggio non trovato");
    }

    const isStaff = await isUserCampaignHelper(
      prisma,
      session.user.id,
      campaign.id
    );

    if (character.userId !== session.user.id && !isStaff) {
      return apiError(403, "Permessi insufficienti");
    }

    const result = await getCharacterAcquirableTalents(prisma, {
      characterId: character.id,
      campaignId: campaign.id,
      // `?view=player` (toggle "Player View" della scheda): lo staff vede il
      // catalogo come lo vedrebbe il giocatore. Può solo restringere la
      // vista, mai ampliarla.
      isMaster:
        isStaff && request.nextUrl.searchParams.get("view") !== "player",
      userId: session.user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching character talents:", error);
    return apiError(500, "Internal server error");
  }
}
