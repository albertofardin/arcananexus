import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isUserCampaignHelper } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { listUserCharacters } from "@/lib/repositories/character.repository";
import {
  getDowntimeByIdScoped,
  updateDowntimeStatus,
  type DowntimeViewer,
} from "@/lib/repositories/downtime.repository";
import { updateDowntimeStatusSchema } from "@/lib/validations/downtime";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; id: string }>;
}

// Stesso limite di `GET .../downtime` (vedi lì): l'insieme completo dei PG
// del giocatore, non solo i 10 più recenti.
const ALL_USER_CHARACTERS = 1000;

// Cambia lo stato di approvazione di una downtime, con un'eventuale risposta
// (T-0xx): SOLO un master (stessa soglia di `PATCH .../downtime/[id]/read`:
// `isUserCampaignHelper`) può farlo, in qualunque momento
// (non solo la prima volta, a differenza della lettura che è idempotente) —
// un giocatore, anche proprietario della downtime, riceve 403. La visibilità
// è comunque risolta con il viewer REALE del chiamante (propri PG per un
// non-master): una downtime esistente ma non visibile resta un 404 (mai
// rivelarne l'esistenza), risolta PRIMA del gate 403 sul ruolo master,
// stesso ordine di `read/route.ts`.
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

  const body = await request.json().catch(() => null);
  const parsedBody = updateDowntimeStatusSchema.safeParse(body);
  if (!parsedBody.success) {
    return apiError(400, "Dati non validi", parsedBody.error.flatten());
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
        "Solo un master può cambiare lo stato di questa downtime"
      );
    }

    const updated = await updateDowntimeStatus(prisma, {
      campaignId: campaign.id,
      actionId,
      status: parsedBody.data.status,
      response: parsedBody.data.response,
      masterNote: parsedBody.data.masterNote,
    });
    if (!updated) {
      return apiError(404, "Downtime non trovata");
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating downtime status:", error);
    return apiError(500, "Internal server error");
  }
}
