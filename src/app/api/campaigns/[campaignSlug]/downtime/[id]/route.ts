import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isUserCampaignHelper } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { listUserCharacters } from "@/lib/repositories/character.repository";
import {
  getDowntimeByIdScoped,
  type DowntimeViewer,
} from "@/lib/repositories/downtime.repository";
import { downtimeDetailSchema } from "@/lib/validations/downtime";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; id: string }>;
}

// Stesso limite di `GET .../downtime` (vedi lì): l'insieme completo dei PG
// del giocatore, non solo i 10 più recenti.
const ALL_USER_CHARACTERS = 1000;

// Dettaglio di una singola downtime (T-0xx): stessa risoluzione viewer/
// visibilità della lista (`GET .../downtime`, chiunque abbia un ruolo di
// campagna vede tutto — vedi il commento lì), applicata a un solo record
// (`getDowntimeByIdScoped`) — 404, non 403, se la downtime esiste ma non è
// visibile al chiamante (mai rivelarne l'esistenza).
export async function GET(request: NextRequest, { params }: RouteContext) {
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

    const downtime = await getDowntimeByIdScoped(prisma, {
      campaignId: campaign.id,
      actionId,
      viewer,
    });
    if (!downtime) {
      return apiError(404, "Downtime non trovata");
    }

    const actionData = downtime.actionData as {
      subject?: string;
      description?: string;
    } | null;
    const response = downtimeDetailSchema.parse({
      id: downtime.id,
      subject: actionData?.subject ?? "",
      author: downtime.author,
      category: downtime.category,
      creationDate: downtime.creationDate,
      readDate: downtime.readDate,
      description: actionData?.description ?? "",
      status: downtime.status,
      response: downtime.response,
      // Mai al giocatore: azzerata a `null` per chiunque non sia master,
      // stesso principio della page (vedi CLAUDE.md "visibilità server-side").
      masterNote: isMaster ? downtime.masterNote : null,
      updateDate: downtime.updateDate,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching downtime detail:", error);
    return apiError(500, "Internal server error");
  }
}
