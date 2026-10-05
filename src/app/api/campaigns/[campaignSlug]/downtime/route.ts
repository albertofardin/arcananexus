import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isUserCampaignHelper } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { listUserCharacters } from "@/lib/repositories/character.repository";
import {
  listDowntimesForCampaign,
  type DowntimeViewer,
} from "@/lib/repositories/downtime.repository";
import {
  downtimeListQuerySchema,
  downtimeListResponseSchema,
  DOWNTIME_PAGE_SIZE,
  type DowntimeListItem,
} from "@/lib/validations/downtime";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Stesso limite di `GET .../missive` (vedi lì): l'insieme completo dei PG
// del giocatore, non solo i 10 più recenti di `listUserCharacters`.
const ALL_USER_CHARACTERS = 1000;

// Lista delle downtime visibili all'utente corrente (T-0xx): chiunque abbia
// un ruolo di campagna (supporter/helper, master, head_master) vede tutte le
// downtime della campagna; un giocatore senza alcun ruolo vede solo quelle
// dei propri personaggi (vedi `downtime.repository.ts` → `DowntimeViewer`).
// La visibilità è enforced qui (via `listDowntimesForCampaign`), mai lato
// client.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug } = await params;

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return apiError(401, "Non autenticato");
  }

  const parsedQuery = downtimeListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsedQuery.success) {
    return apiError(400, "Parametri non validi", parsedQuery.error.flatten());
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

    const {
      authorCharacterId,
      category,
      dateFrom,
      dateTo,
      search,
      status,
      page,
    } = parsedQuery.data;
    const { downtimes, filterOptions, pagination } =
      await listDowntimesForCampaign(prisma, {
        campaignId: campaign.id,
        viewer,
        filters: {
          authorCharacterId,
          category,
          dateFrom,
          dateTo,
          search,
          status,
        },
        page,
        pageSize: DOWNTIME_PAGE_SIZE,
      });

    const items: DowntimeListItem[] = downtimes.map(downtime => {
      const actionData = downtime.actionData as { subject?: string } | null;
      return {
        id: downtime.id,
        subject: actionData?.subject ?? "",
        author: downtime.author,
        category: downtime.category,
        creationDate: downtime.creationDate,
        readDate: downtime.readDate,
        status: downtime.status,
      };
    });

    const response = downtimeListResponseSchema.parse({
      downtimes: items,
      filterOptions,
      pagination,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching downtime list:", error);
    return apiError(500, "Internal server error");
  }
}
