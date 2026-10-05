import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isUserCampaignHelper } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { listUserCharacters } from "@/lib/repositories/character.repository";
import {
  getMissiveByIdScoped,
  getThreadReplies,
  updateMissiveContentIfUnread,
  type MissiveViewer,
} from "@/lib/repositories/missive.repository";
import { parseMissiveActionData } from "@/lib/features/handlers/missive";
import {
  missiveDetailSchema,
  updateMissiveContentSchema,
} from "@/lib/validations/missive";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; id: string }>;
}

// Stesso limite di `GET .../missive` (vedi lì): l'insieme completo dei PG
// del giocatore, non solo i 10 più recenti.
const ALL_USER_CHARACTERS = 1000;

// Dettaglio di una singola missiva (T-0xx): stessa risoluzione viewer/
// visibilità della lista (`GET .../missive`, chiunque abbia un ruolo di
// campagna vede tutto — vedi il commento lì), applicata a un solo record
// (`getMissiveByIdScoped`) — 404, non 403, se la missiva esiste ma non è
// visibile al chiamante (mai rivelarne l'esistenza).
export async function GET(request: NextRequest, { params }: RouteContext) {
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

    // Sempre risolti per ENTRAMBI i rami (stesso pattern di `GET .../missive`,
    // non solo per il giocatore): `ownCharacterIds` è richiesto dal tipo
    // `MissiveViewer` e in questa route specifica è inerte per un master
    // (`buildBoxWhere`, il suo unico consumer, non è mai chiamato da
    // `getMissiveByIdScoped` — che risolve UNA sola missiva già nota, mai
    // filtrata per box), ma calcolarlo comunque evita un'asimmetria fra i
    // due rami e tiene il pattern coerente con le altre route missive.
    const ownCharacters = await listUserCharacters(prisma, {
      userId: session.user.id,
      campaignSlug,
      take: ALL_USER_CHARACTERS,
    });
    // Visibilità delle Comunicazioni per un giocatore (T-0xx, regola
    // prodotto aggiornata): ALMENO UN personaggio attivo, PG O PNG
    // indifferentemente — rilevante solo per il ramo giocatore, un master
    // vede SEMPRE la Comunicazione (vedi `missive.repository.ts`).
    const hasActiveCharacter = ownCharacters.some(
      character => getCharacterStatus(character) === "approved"
    );

    const viewer: MissiveViewer = isMaster
      ? {
          isMaster: true,
          ownCharacterIds: ownCharacters.map(character => character.id),
          userId: session.user.id,
        }
      : {
          isMaster: false,
          characterIds: ownCharacters.map(character => character.id),
          hasActiveCharacter,
        };

    const missive = await getMissiveByIdScoped(prisma, {
      campaignId: campaign.id,
      actionId,
      viewer,
    });
    if (!missive) {
      return apiError(404, "Missiva non trovata");
    }

    const actionData = parseMissiveActionData(missive.actionData);

    // Il thread completo si carica SOLO se la missiva risolta è la RADICE:
    // se `missive` è essa stessa una risposta, questa route non ha un
    // concetto di redirect (è un'API JSON, non una pagina) — restituisce
    // semplicemente quel singolo messaggio con `thread: []`, il chiamante
    // decide se seguire `threadRootId` per il messaggio radice.
    const thread = missive.isReply
      ? []
      : (
          await getThreadReplies(prisma, {
            campaignId: campaign.id,
            actionId: missive.id,
            viewer,
          })
        ).map(reply => {
          const replyActionData = parseMissiveActionData(reply.actionData);
          return {
            id: reply.id,
            subject: replyActionData.subject,
            description: replyActionData.description,
            receiver: reply.receiver,
            sendDate: reply.sendDate,
            readDate: reply.readDate,
            isCommunication: reply.isCommunication,
            isFreeReceiver: reply.isFreeReceiver,
            isMasterReceiver: reply.isMasterReceiver,
            receiverFreeText: reply.receiverFreeText,
            masterSenderName: reply.masterSenderName,
            isReply: reply.isReply,
            threadRootId: reply.threadRootId,
            sender: reply.character
              ? {
                  id: reply.character.id,
                  name: reply.character.name,
                  avatar: reply.character.avatar,
                  userName: reply.character.user.name,
                }
              : null,
          };
        });

    const response = missiveDetailSchema.parse({
      id: missive.id,
      subject: actionData.subject,
      description: actionData.description,
      receiver: missive.receiver,
      sendDate: missive.sendDate,
      readDate: missive.readDate,
      isCommunication: missive.isCommunication,
      isFreeReceiver: missive.isFreeReceiver,
      isMasterReceiver: missive.isMasterReceiver,
      receiverFreeText: missive.receiverFreeText,
      readByCharacters: missive.readByCharacters,
      masterSenderName: missive.masterSenderName,
      isReply: missive.isReply,
      threadRootId: missive.threadRootId,
      thread,
      sender: missive.character
        ? {
            id: missive.character.id,
            name: missive.character.name,
            avatar: missive.character.avatar,
            userName: missive.character.user.name,
          }
        : null,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching missive detail:", error);
    return apiError(500, "Internal server error");
  }
}

// Modifica il contenuto di una missiva già inviata (T-0xx, "modifica
// missiva"): SOLO il mittente reale (proprietario del `Character` autore) e
// SOLO se il destinatario non l'ha ancora letta — mai per Comunicazione/
// "Campo libero"/"a nome del master" (nessun "mittente" nel senso qui
// inteso, vedi `missive.isCommunication`/`isFreeReceiver`/`character`).
// Visibilità risolta ESATTAMENTE come la GET (404, non 403, se la missiva
// esiste ma non è visibile al chiamante); l'autorizzazione a modificare è un
// controllo ulteriore, applicato DOPO. Il vero gate di concorrenza contro
// una lettura simultanea del destinatario è nell'`updateMany` atomico di
// `updateMissiveContentIfUnread` — il controllo su `missive.readDate` qui
// sotto è solo un fast-path per rispondere 409 senza nemmeno tentare la
// scrittura quando è già ovviamente troppo tardi.
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

  const body = await request.json().catch(() => null);
  const parsedBody = updateMissiveContentSchema.safeParse(body);
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

    const ownCharacters = await listUserCharacters(prisma, {
      userId: session.user.id,
      campaignSlug,
      take: ALL_USER_CHARACTERS,
    });
    const ownCharacterIds = ownCharacters.map(character => character.id);
    const hasActiveCharacter = ownCharacters.some(
      character => getCharacterStatus(character) === "approved"
    );

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

    const missive = await getMissiveByIdScoped(prisma, {
      campaignId: campaign.id,
      actionId,
      viewer,
    });
    if (!missive) {
      return apiError(404, "Missiva non trovata");
    }

    if (
      missive.isCommunication ||
      missive.isFreeReceiver ||
      missive.character === null ||
      !ownCharacterIds.includes(missive.character.id)
    ) {
      return apiError(403, "Solo il mittente può modificare questa missiva");
    }

    if (missive.readDate) {
      return apiError(
        409,
        "Il destinatario ha già letto questa missiva: non è più possibile modificarla"
      );
    }

    const result = await updateMissiveContentIfUnread(prisma, {
      campaignId: campaign.id,
      actionId,
      authorCharacterId: missive.character.id,
      description: parsedBody.data.description,
    });

    if (result === "not-found") {
      return apiError(404, "Missiva non trovata");
    }
    if (result === "already-read") {
      return apiError(
        409,
        "Il destinatario ha già letto questa missiva: non è più possibile modificarla"
      );
    }

    return NextResponse.json({ description: parsedBody.data.description });
  } catch (error) {
    console.error("Error updating missive content:", error);
    return apiError(500, "Internal server error");
  }
}
