import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import { listCampaignCharacters } from "@/lib/repositories/character.repository";
import { updateXp } from "@/lib/services/xp.service";
import { xpGrantSchema } from "@/lib/validations/character";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Aggiornamento bulk di XP (master/head_master, T-0xx): un unico importo
// applicato ai personaggi *attivi* ("approved", PG o PNG) selezionati con le
// checkbox nell'UI (`CampaignProgress.tsx`, stesso filtro "attivo"
// applicato anche lì lato client) — un `characterId` che non è più attivo al
// momento del submit (o non esiste nella campagna) è semplicemente ignorato,
// non genera alcuna transazione. A differenza della ricarica downtime
// (`updateMany` su un campo scalare), qui serve una riga `XpTransaction` per
// personaggio (ledger, non un contatore) — un solo `$transaction` con un
// `create` per ogni personaggio selezionato.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug } = await params;

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
  const parsed = xpGrantSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "Dati non validi", parsed.error.flatten());
  }

  try {
    const allCharacters = await listCampaignCharacters(
      prisma,
      access.campaign.id
    );
    const requestedIds = new Set(parsed.data.characterIds);
    const characters = allCharacters.filter(
      character =>
        requestedIds.has(character.id) &&
        getCharacterStatus(character) === "approved"
    );

    // `timeout: 20000` (default Prisma 5000ms, stesso P2028 osservato nella
    // creazione PG): una `XpTransaction` per personaggio selezionato, in
    // sequenza — con un roster ampio la latenza di rete verso Neon può far
    // superare il timeout di default a metà del batch.
    const result = await prisma.$transaction(
      async tx => {
        for (const character of characters) {
          await updateXp(tx, character, parsed.data.amount, {
            updatedByUserId: access.userId,
            note: parsed.data.note,
          });
        }
        return characters.length;
      },
      { timeout: 20000 }
    );

    return NextResponse.json({ updatedCount: result });
  } catch (error) {
    console.error("Error granting campaign XP:", error);
    return apiError(500, "Internal server error");
  }
}
