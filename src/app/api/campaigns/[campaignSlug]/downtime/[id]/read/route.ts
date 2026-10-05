import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isUserCampaignHelper } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { listUserCharacters } from "@/lib/repositories/character.repository";
import {
  getDowntimeByIdScoped,
  markDowntimeAsRead,
  type DowntimeViewer,
} from "@/lib/repositories/downtime.repository";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; id: string }>;
}

// Stesso limite di `GET .../downtime` (vedi lì): l'insieme completo dei PG
// del giocatore, non solo i 10 più recenti.
const ALL_USER_CHARACTERS = 1000;

// Segna una downtime come letta (T-0xx, badge Aperta/Non letta): SOLO un
// master (stessa soglia ovunque nelle missive: `isUserCampaignHelper`) può
// farlo — un giocatore che apre il dettaglio
// della propria downtime non la segna mai come letta (sa già cosa ha
// scritto), a differenza di `PATCH .../missive/[id]/read` dove è il
// destinatario a farlo. La visibilità è comunque risolta con il viewer REALE
// del chiamante (propri PG per un non-master): una downtime esistente ma
// non visibile resta un 404 (mai rivelarne l'esistenza), una downtime
// visibile ma il cui autore non è un master resta un 403. Chiamata da
// `MarkDowntimeRead.tsx`, un client component che spara la richiesta al
// mount REALE nel browser — mai durante il prefetch di `<Link>` (che non
// esegue JS client-side), quindi non rischia di segnare come lette downtime
// mai aperte davvero solo perché sono scorse in lista.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, id } = await params;

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return apiError(401, "Non autenticato");
  }

  const actionId = Number(id);
  if (!Number.isInteger(actionId) || actionId <= 0) {
    return apiError(400, "Id downtime non valido");
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

    const viewer: DowntimeViewer = isMaster
      ? { isMaster: true }
      : await (async () => {
          const ownCharacters = await listUserCharacters(prisma, {
            userId: session.user.id,
            campaignSlug,
            take: ALL_USER_CHARACTERS,
          });
          return {
            isMaster: false,
            characterIds: ownCharacters.map(character => character.id),
          };
        })();

    // Stessa risoluzione/visibilità della GET di dettaglio: 404, non 403,
    // se la downtime esiste ma non è visibile al chiamante.
    const downtime = await getDowntimeByIdScoped(prisma, {
      campaignId: campaign.id,
      actionId,
      viewer,
    });
    if (!downtime) {
      return apiError(404, "Downtime non trovata");
    }

    if (!isMaster) {
      return apiError(
        403,
        "Solo un master può segnare questa downtime come letta"
      );
    }

    if (!downtime.readDate) {
      await markDowntimeAsRead(prisma, { campaignId: campaign.id, actionId });
    }

    return NextResponse.json({ readDate: downtime.readDate ?? new Date() });
  } catch (error) {
    console.error("Error marking downtime as read:", error);
    return apiError(500, "Internal server error");
  }
}
