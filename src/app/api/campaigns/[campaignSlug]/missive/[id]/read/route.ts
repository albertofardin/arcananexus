import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isUserCampaignHelper } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { listUserCharacters } from "@/lib/repositories/character.repository";
import {
  getMissiveByIdScoped,
  markCommunicationMissiveAsRead,
  markFreeReceiverMissiveAsRead,
  markMissiveAsRead,
  type MissiveViewer,
} from "@/lib/repositories/missive.repository";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; id: string }>;
}

// Stesso limite di `GET .../missive` (vedi lì): l'insieme completo dei PG
// del giocatore, non solo i 10 più recenti.
const ALL_USER_CHARACTERS = 1000;

// Segna una missiva come letta (T-0xx, badge Ricevuto/Letto): SOLO il
// proprietario del Character destinatario può farlo — non il mittente (sa
// già di averla scritta). Un ruolo di campagna (supporter/helper, master,
// head_master) amplia la VISIBILITÀ (vede tutta la campagna via
// `getMissiveByIdScoped` sotto), ma non deve impedire il normale
// comportamento quando quel viewer È ANCHE il proprietario del PG
// destinatario — per questo `ownCharacterIds` è risolto sempre, non solo
// per i viewer senza ruolo di campagna (vedi sotto).
// Chiamata da `MarkMissiveRead.tsx`, un client component che spara la
// richiesta al mount REALE nel browser — mai durante il prefetch di
// `<Link>` (che non esegue JS client-side), quindi non rischia di segnare
// come lette missive mai aperte davvero solo perché sono scorse in lista.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, id } = await params;

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return apiError(401, "Non autenticato");
  }

  const actionId = Number(id);
  if (!Number.isInteger(actionId) || actionId <= 0) {
    return apiError(400, "Id missiva non valido");
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

    const isMaster = await isUserCampaignHelper(
      prisma,
      session.user.id,
      campaign.id
    );

    const ownCharacters = await listUserCharacters(prisma, {
      userId: session.user.id,
      campaignSlug,
      take: ALL_USER_CHARACTERS,
    });
    const ownCharacterIds = ownCharacters.map(character => character.id);
    // Personaggi attivi (T-0xx, Comunicazione — stesso concetto usato per la
    // visibilità, vedi `missive.repository.ts`): PG O PNG indifferentemente
    // (regola prodotto aggiornata, non solo PG come in precedenza), ordinati
    // per id per una scelta deterministica del "primo" quando il chiamante
    // ne ha più di uno (edge case raro, vedi `activeCharacters[0]` sotto).
    const activeCharacters = ownCharacters
      .filter(character => getCharacterStatus(character) === "approved")
      .sort((a, b) => a.id - b.id);

    // `hasActiveCharacter`: ALMENO UN personaggio attivo, rilevante solo per
    // il ramo giocatore (T-0xx, regola prodotto aggiornata: un master vede
    // SEMPRE la Comunicazione, nessun gate — vedi `missive.repository.ts`).
    const hasActiveCharacter = activeCharacters.length > 0;

    const viewer: MissiveViewer = isMaster
      ? {
          isMaster: true,
          ownCharacterIds,
          userId: session.user.id,
        }
      : {
          isMaster: false,
          characterIds: ownCharacterIds,
          hasActiveCharacter,
        };

    // Stessa risoluzione/visibilità della GET di dettaglio: 404, non 403,
    // se la missiva esiste ma non è visibile al chiamante.
    const missive = await getMissiveByIdScoped(prisma, {
      campaignId: campaign.id,
      actionId,
      viewer,
    });
    if (!missive) {
      return apiError(404, "Missiva non trovata");
    }

    // Comunicazione (T-0xx): nessun `receiver` singolo, quindi l'azione
    // "segna come letta" è di TUTTI i personaggi attivi del chiamante (PG O
    // PNG, vedi `activeCharacters` sopra), non solo il primo — una persona
    // con più di un personaggio attivo nella stessa campagna deve risultare
    // "ha letto" con OGNI suo personaggio attivo (bug reale corretto qui:
    // prima si marcava solo `activePgCharacters[0]`, lasciando gli altri
    // fuori da `readByCharacterIds`) — non del "destinatario", concetto che
    // qui non esiste. Vale sia per un giocatore sia per un master con più
    // personaggi attivi.
    if (missive.isCommunication) {
      if (activeCharacters.length === 0) {
        return apiError(
          403,
          "Solo un personaggio attivo può segnare questa comunicazione come letta"
        );
      }

      if (!missive.readDate) {
        await markCommunicationMissiveAsRead(prisma, {
          campaignId: campaign.id,
          actionId,
          characterIds: activeCharacters.map(character => character.id),
        });
      }

      return NextResponse.json({ readDate: missive.readDate ?? new Date() });
    }

    // Campo libero (T-0xx): nessun `Character` destinatario, quindi nessun
    // "proprietario" che possa segnarla come letta (il check sotto fallirebbe
    // sempre, dato che `missive.receiver` è sempre `null` su questo ramo) —
    // è visibile a tutti i master (vedi `buildVisibilityWhere`) ed è "letta"
    // dal PRIMO master che la apre, non dal mittente che riapre la propria
    // missiva inviata (un non-master che apre la propria missiva libera non
    // la segna mai come letta).
    if (missive.isFreeReceiver) {
      if (isMaster) {
        if (!missive.readDate) {
          await markFreeReceiverMissiveAsRead(prisma, {
            campaignId: campaign.id,
            actionId,
          });
        }
        return NextResponse.json({ readDate: missive.readDate ?? new Date() });
      }
      return NextResponse.json({ readDate: missive.readDate });
    }

    // Controllo indipendente da `isMaster`/`viewer`: un ruolo di campagna
    // dà visibilità su tutto, ma segnare come letta resta un'azione del
    // destinatario, chiunque esso sia (vedi il commento in testa al file).
    if (!missive.receiver || !ownCharacterIds.includes(missive.receiver.id)) {
      return apiError(
        403,
        "Solo il destinatario può segnare questa missiva come letta"
      );
    }

    if (!missive.readDate) {
      await markMissiveAsRead(prisma, {
        campaignId: campaign.id,
        actionId,
        expectedReceiverCharacterId: missive.receiver.id,
      });
    }

    return NextResponse.json({ readDate: missive.readDate ?? new Date() });
  } catch (error) {
    console.error("Error marking missive as read:", error);
    return apiError(500, "Internal server error");
  }
}
