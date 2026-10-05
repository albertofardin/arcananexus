import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isUserCampaignHelper } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { listUserCharacters } from "@/lib/repositories/character.repository";
import {
  listMissivesForCampaign,
  type MissiveViewer,
} from "@/lib/repositories/missive.repository";
import { parseMissiveActionData } from "@/lib/features/handlers/missive";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus";
import {
  missiveListQuerySchema,
  missiveListResponseSchema,
  MISSIVE_PAGE_SIZE,
  type MissiveListItem,
} from "@/lib/validations/missive";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Non c'è un limite ragionevole di "PG del giocatore" (a differenza del
// default `take: 10` di `listUserCharacters`, pensato per una lista
// "personaggi recenti"): qui serve l'insieme COMPLETO per non far sparire
// dalla vista missive di un PG più vecchio del decimo.
const ALL_USER_CHARACTERS = 1000;

// Lista delle missive visibili all'utente corrente (T-0xx): chiunque abbia
// un ruolo di campagna (supporter/helper, master, head_master) vede tutte le
// missive della campagna — un supporter "vede tutto ma non modifica nulla"
// (vedi `roleDefinitions.ts`), stesso identico
// trattamento di master/head_master qui; un giocatore senza alcun ruolo
// vede solo quelle inviate O ricevute da uno dei propri PG (vedi
// `missive.repository.ts` → `MissiveViewer`). La visibilità è enforced qui
// (via `listMissivesForCampaign`), mai lato client.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug } = await params;

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return apiError(401, "Non autenticato");
  }

  const parsedQuery = missiveListQuerySchema.safeParse(
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

    // Query unica: un master PUÒ possedere anche un PG reale in questa
    // campagna (es. un super-admin che gioca un proprio personaggio, bug
    // reale osservato in produzione — vedi `ownCharacterIds` in
    // `missive.repository.ts`), quindi `listUserCharacters` serve a
    // ENTRAMBI i rami, non solo a quello giocatore.
    const ownCharacters = await listUserCharacters(prisma, {
      userId: session.user.id,
      campaignSlug,
      take: ALL_USER_CHARACTERS,
    });
    // Visibilità delle Comunicazioni per un giocatore (T-0xx, regola
    // prodotto aggiornata): ALMENO UN personaggio attivo, PG O PNG
    // indifferentemente (vedi il commento su `hasActiveCharacter` in
    // `missive.repository.ts`) — rilevante solo per il ramo giocatore: un
    // master vede SEMPRE la Comunicazione, nessun gate (vedi sotto).
    const hasActiveCharacter = ownCharacters.some(
      character => getCharacterStatus(character) === "approved"
    );

    const viewer: MissiveViewer = isMaster
      ? {
          isMaster: true,
          ownCharacterIds: ownCharacters.map(character => character.id),
          // QUALE master sta guardando (T-0xx, tab "Inviate" scenario
          // Marco/Pippo): sempre dalla sessione server-side, mai dal client.
          userId: session.user.id,
        }
      : {
          isMaster: false,
          characterIds: ownCharacters.map(character => character.id),
          hasActiveCharacter,
        };

    const {
      senderCharacterId,
      receiverCharacterId,
      dateFrom,
      dateTo,
      search,
      page,
      box,
    } = parsedQuery.data;
    const { missives, filterOptions, pagination } =
      await listMissivesForCampaign(prisma, {
        campaignId: campaign.id,
        viewer,
        filters: {
          senderCharacterId,
          receiverCharacterId,
          dateFrom,
          dateTo,
          search,
          box,
        },
        page,
        pageSize: MISSIVE_PAGE_SIZE,
      });

    const items: MissiveListItem[] = missives.map(missive => {
      const actionData = parseMissiveActionData(missive.actionData);
      return {
        id: missive.id,
        subject: actionData.subject,
        receiver: missive.receiver,
        sendDate: missive.sendDate,
        readDate: missive.readDate,
        isCommunication: missive.isCommunication,
        isFreeReceiver: missive.isFreeReceiver,
        isMasterReceiver: missive.isMasterReceiver,
        receiverFreeText: missive.receiverFreeText,
        masterSenderName: missive.masterSenderName,
        isReply: missive.isReply,
        threadRootId: missive.threadRootId,
        sender: missive.character
          ? {
              id: missive.character.id,
              name: missive.character.name,
              avatar: missive.character.avatar,
              userName: missive.character.user.name,
            }
          : null,
      };
    });

    const response = missiveListResponseSchema.parse({
      missives: items,
      filterOptions,
      pagination,
      // Calcolato qui (già disponibile localmente), non nel repository:
      // decide lato client se mostrare la terza tab "Tutte le missive"
      // (master-only, vedi `MissiveList.tsx`).
      viewerIsMaster: isMaster,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching missive list:", error);
    return apiError(500, "Internal server error");
  }
}
