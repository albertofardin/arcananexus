import { CharacterType } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import MissiveReader, { MissivePeople } from "@/components/MissiveReader";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isUserCampaignHelper } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import {
  getCharacterInCampaign,
  listUserCharacters,
} from "@/lib/repositories/character.repository";
import { getFeatureByFunctionName } from "@/lib/repositories/feature.repository";
import {
  getMissiveByIdScoped,
  getReplyEligibility,
  getThreadReplies,
  type MissiveViewer,
  type MissiveWithSender,
} from "@/lib/repositories/missive.repository";
import { FT_MISSIVE } from "@/lib/features/featuresName";
import {
  missiveFeatureSchema,
  parseMissiveActionData,
} from "@/lib/features/handlers/missive";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus";
import BtnLink from "@/components/_core/BtnLink";
import { routes } from "@/app/routes";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

const ALL_USER_CHARACTERS = 1000;

// Solo il proprietario del `Character` destinatario segna un messaggio come
// letto aprendo questa pagina — non il mittente, e indipendentemente dal
// ruolo di campagna (stesso principio già enforced server-side in
// `PATCH .../missive/[id]/read`, qui decide solo se montare
// `MarkMissiveRead`). Applicata sia alla radice sia a ogni risposta del
// thread (T-0xx): stessa identica logica di `isReceiverOwner`/`readDate`
// dell'originale, ripetuta in loop invece che una sola volta.
// Eligibilità di modifica di un messaggio (T-0xx, "modifica missiva"): SOLO
// il mittente reale (proprietario del `Character` autore) e SOLO se il
// destinatario non l'ha ancora letta — mai per Comunicazione/"Campo libero"
// (nessun "mittente" nel senso qui inteso: rispettivamente broadcast e senza
// un vero destinatario tracciabile) né per una missiva "a nome del master"
// (`character === null`). `message.readDate`, per il ramo reale, è sempre
// `actionData.readDate` grezzo (mai l'aggregato viewer-dipendente della
// Comunicazione, già escluso sopra), quindi il gate è identico a quello
// server-side enforced in `PATCH .../missive/[id]`
// (`updateMissiveContentIfUnread`), qui solo per decidere se mostrare il
// pulsante "MODIFICA".
function canEditMissive(
  message: MissiveWithSender,
  ownCharacterIds: number[]
): boolean {
  return (
    !message.isCommunication &&
    !message.isFreeReceiver &&
    message.character !== null &&
    ownCharacterIds.includes(message.character.id) &&
    !message.readDate
  );
}

function shouldMarkAsRead(
  missive: MissiveWithSender,
  actionData: ReturnType<typeof parseMissiveActionData>,
  ownCharacterIds: number[],
  activeCharacterIds: number[],
  isMaster: boolean
): boolean {
  if (missive.isCommunication) {
    const readByCharacterIds =
      "communication" in actionData ? actionData.readByCharacterIds : [];
    return (
      activeCharacterIds.length > 0 &&
      !readByCharacterIds.some(id => activeCharacterIds.includes(id))
    );
  }
  if (missive.isFreeReceiver) {
    return isMaster && !missive.readDate;
  }
  const isReceiverOwner =
    missive.receiver !== null && ownCharacterIds.includes(missive.receiver.id);
  return isReceiverOwner && !missive.readDate;
}

export default async function Page({
  params,
}: {
  params: Promise<{ campaignSlug: string; id: string }>;
}) {
  const { campaignSlug, id } = await params;
  const headersList = await headers();

  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user) {
    notFound();
  }

  const campaign = await getCampaignBySlug(
    prisma,
    campaignSlug,
    ARCANA_DOMINE_SLUG
  );
  if (!campaign) {
    notFound();
  }

  const actionId = Number(id);
  if (!Number.isInteger(actionId) || actionId <= 0) {
    notFound();
  }

  const isMaster = await isUserCampaignHelper(
    prisma,
    session.user.id,
    campaign.id
  );

  // Sempre risolti, anche per un viewer con ruolo di campagna: un helper/
  // master/head_master può avere anche lui un proprio PG nella campagna, e
  // se è proprio quel PG il destinatario della missiva la apertura deve
  // comunque segnarla come letta (vedi `isReceiverOwner` sotto) — avere un
  // ruolo di campagna amplia la VISIBILITÀ (vede tutta la campagna), non
  // deve invece impedire il normale comportamento "il destinatario apre la
  // sua posta" quando è lui stesso quel destinatario.
  const ownCharacters = await listUserCharacters(prisma, {
    userId: session.user.id,
    campaignSlug,
    take: ALL_USER_CHARACTERS,
  });
  const ownCharacterIds = ownCharacters.map(character => character.id);
  // Personaggi attivi del viewer (T-0xx, Comunicazione — stesso concetto
  // usato per la visibilità, vedi `missive.repository.ts`): PG O PNG
  // indifferentemente (regola prodotto aggiornata, non solo PG come in
  // precedenza) — "letta" per una Comunicazione è per-personaggio, non un
  // singolo destinatario (vedi `shouldMarkAsRead` sopra).
  const activeCharacterIds = ownCharacters
    .filter(character => getCharacterStatus(character) === "approved")
    .map(character => character.id);

  const viewer: MissiveViewer = isMaster
    ? { isMaster: true, ownCharacterIds, userId: session.user.id }
    : {
        isMaster: false,
        characterIds: ownCharacterIds,
        hasActiveCharacter: activeCharacterIds.length > 0,
      };

  const missive = await getMissiveByIdScoped(prisma, {
    campaignId: campaign.id,
    actionId,
    viewer,
  });
  if (!missive) {
    notFound();
  }

  // URL canonico unico condiviso dall'intero thread: se la missiva risolta È
  // una risposta, si va sempre alla radice, mai a un messaggio intermedio —
  // la pagina di dettaglio esiste una sola volta per thread (vedi
  // `MissiveRow.tsx`, che punta già sempre alla radice in lista).
  if (missive.isReply && missive.threadRootId !== null) {
    redirect(routes.campaignMissiveDetail(campaignSlug, missive.threadRootId));
  }

  const actionData = parseMissiveActionData(missive.actionData);
  const isRealBranch = !missive.isCommunication && !missive.isFreeReceiver;

  const thread = await getThreadReplies(prisma, {
    campaignId: campaign.id,
    actionId: missive.id,
    viewer,
  });

  // Configurazione feature (T-0xx, "risposte alle missive"): assente se la
  // feature è stata disattivata dopo l'invio di questa missiva — in quel
  // caso nessuna risposta è possibile (nessun `functionName` attivo verso
  // cui la route di esecuzione azioni potrebbe instradarla), quindi
  // `replyEligible` resta `null` senza bisogno di ulteriori controlli.
  const feature = await getFeatureByFunctionName(
    prisma,
    campaign.id,
    FT_MISSIVE
  );
  const missiveConfig = feature
    ? missiveFeatureSchema.parse(feature.featureData)
    : null;

  // Eligibilità di risposta PER QUESTO VIEWER (T-0xx): solo il ramo reale è
  // mai rispondibile (vedi `getReplyEligibility`), e solo se il personaggio
  // che ha diritto al turno è uno dei PROPRI — un viewer che vede il thread
  // solo per il proprio ruolo di campagna (master/helper) non deve vedersi
  // proporre un form di risposta se non è lui stesso l'interlocutore.
  let replyEligible: {
    rootId: number;
    rootSubject: string;
    receiverCharacterId?: number;
    receiverIsPng: boolean;
    senderCharacterId: number;
    missivePoints: number;
    downtimePoints: number;
  } | null = null;

  // Eligibilità di risposta DEL MASTER (T-0xx, missive "a nome del master"
  // rispondibili): presente SOLO quando il viewer è proprio il master che ha
  // scritto la radice del thread (`expectedSenderUserId`), mai un master
  // diverso della stessa campagna — stesso principio di `replyEligible`
  // sopra, applicato al lato master invece che al lato PG.
  let masterReplyEligible: {
    rootId: number;
    rootSubject: string;
    receiverCharacterId: number;
  } | null = null;
  // `true` quando questo PG avrebbe diritto al turno ma lo staff ha sospeso
  // l'invio di missive (`Feature.paused`) — vedi il null-out di
  // `replyEligible` sotto. Passato a `MissiveReader` per mostrare un avviso
  // al posto del form di risposta.
  let replyPaused = false;

  if (isRealBranch && missiveConfig) {
    const eligibility = await getReplyEligibility(prisma, {
      campaignId: campaign.id,
      rootActionId: missive.id,
      config: missiveConfig,
    });

    if (
      eligibility.allowed &&
      eligibility.expectedSenderCharacterId !== undefined &&
      ownCharacterIds.includes(eligibility.expectedSenderCharacterId)
    ) {
      const senderCharacter = ownCharacters.find(
        character => character.id === eligibility.expectedSenderCharacterId
      );
      if (
        senderCharacter &&
        eligibility.expectedReceiverCharacterId !== undefined
      ) {
        // Tipo (PG/PNG) del destinatario di QUESTA risposta, risolto dal
        // `Character` reale (mai da `actionData`, stesso principio
        // applicato dall'handler): alimenta il banner "consumerà downtime"
        // in `MissiveWriter`, identico a quello di una missiva "da zero".
        const receiverCharacter = await getCharacterInCampaign(
          prisma,
          eligibility.expectedReceiverCharacterId,
          campaign.id
        );
        if (receiverCharacter) {
          replyEligible = {
            rootId: missive.id,
            rootSubject: actionData.subject,
            receiverCharacterId: eligibility.expectedReceiverCharacterId,
            receiverIsPng: receiverCharacter.type === CharacterType.png,
            senderCharacterId: senderCharacter.id,
            missivePoints: senderCharacter.missivePoints,
            downtimePoints: senderCharacter.downtimePoints,
          };
        }
      } else if (
        senderCharacter &&
        eligibility.expectedReceiverUserId !== undefined
      ) {
        // Risposta rivolta al master (T-0xx): nessun `Character`
        // destinatario da risolvere, nessuna distinzione PNG/downtime —
        // sempre un punto missiva pieno, salvo `canAnswerFree` (vedi
        // `handler` in `handlers/missive.ts`).
        replyEligible = {
          rootId: missive.id,
          rootSubject: actionData.subject,
          receiverIsPng: false,
          senderCharacterId: senderCharacter.id,
          missivePoints: senderCharacter.missivePoints,
          downtimePoints: senderCharacter.downtimePoints,
        };
      }
    }

    if (
      isMaster &&
      eligibility.allowed &&
      eligibility.expectedSenderUserId === session.user.id &&
      eligibility.expectedReceiverCharacterId !== undefined
    ) {
      masterReplyEligible = {
        rootId: missive.id,
        rootSubject: actionData.subject,
        receiverCharacterId: eligibility.expectedReceiverCharacterId,
      };
    }

    // Sospensione lato PG (T-0xx, `Feature.paused`): `feature` è di fatto
    // sempre non-null qui (`missiveConfig` è derivato da lui, ed è la guardia
    // di questo blocco), l'optional chaining serve solo a evitare
    // un'asserzione non-null esplicita. Lo staff (`isMaster`, in realtà
    // `isUserCampaignHelper` — vedi sopra) mantiene sempre
    // `masterReplyEligible` intatto, solo il PG col turno perde
    // `replyEligible` — `replyPaused` distingue questo caso ("avresti potuto
    // rispondere, ma è in pausa") dal normale "non è il tuo turno" (nessun
    // messaggio, comportamento invariato).
    if (replyEligible && feature?.paused && !isMaster) {
      replyEligible = null;
      replyPaused = true;
    }
  }

  // Comunicazione: monta `MarkMissiveRead` quando il viewer ha ALMENO UN
  // personaggio attivo E quel personaggio non ha ancora letto (id assente da
  // `readByCharacterIds`) — letto direttamente dal dato grezzo, non da
  // `missive.readDate` (che per un viewer master è un aggregato "letta da
  // qualcuno", non "letta da ME", vedi `resolveReadDate` in
  // `missive.repository.ts`). Ripetuto per ogni messaggio del thread (radice
  // + risposte), non solo per la radice come prima dell'introduzione delle
  // risposte.
  const messages = [missive, ...thread];
  const messagesActionData = messages.map(message =>
    parseMissiveActionData(message.actionData)
  );
  const markAsReadByMessageId = new Map(
    messages.map((message, index) => [
      message.id,
      shouldMarkAsRead(
        message,
        messagesActionData[index],
        ownCharacterIds,
        activeCharacterIds,
        isMaster
      ),
    ])
  );
  // Eligibilità di modifica (T-0xx, "modifica missiva"): calcolata per
  // radice + ogni risposta del thread, stesso principio di
  // `markAsReadByMessageId` sopra — vedi `canEditMissive`.
  const canEditByMessageId = new Map(
    messages.map(message => [
      message.id,
      canEditMissive(message, ownCharacterIds),
    ])
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BtnLink
          href={routes.campaignMissive(campaignSlug)}
          icon="arrow_back"
          label="Torna alle missive"
        />
        <MissivePeople
          character={missive.character}
          receiver={missive.receiver}
          isCommunication={missive.isCommunication}
          isFreeReceiver={missive.isFreeReceiver}
          receiverFreeText={missive.receiverFreeText}
        />
      </div>

      <MissiveReader
        campaignSlug={campaignSlug}
        missiveId={missive.id}
        subject={actionData.subject}
        description={actionData.description}
        sendDate={missive.sendDate}
        character={missive.character}
        isCommunication={missive.isCommunication}
        readByCharacters={missive.readByCharacters}
        markAsRead={markAsReadByMessageId.get(missive.id) ?? false}
        masterSenderName={missive.masterSenderName}
        canEdit={canEditByMessageId.get(missive.id) ?? false}
        thread={thread.map((message, index) => {
          const messageActionData = messagesActionData[index + 1];
          return {
            id: message.id,
            subject: messageActionData.subject,
            description: messageActionData.description,
            character: message.character,
            receiver: message.receiver,
            masterSenderName: message.masterSenderName,
            sendDate: message.sendDate,
            markAsRead: markAsReadByMessageId.get(message.id) ?? false,
            canEdit: canEditByMessageId.get(message.id) ?? false,
          };
        })}
        canAnswerFree={missiveConfig?.canAnswerFree ?? false}
        pngCountsAsDowntime={missiveConfig?.pngCountsAsDowntime ?? false}
        canAnswer={missiveConfig?.canAnswer ?? false}
        threadMax={
          missiveConfig?.canAnswerThread
            ? missiveConfig.maxThreadMessages
            : null
        }
        viewerIsMaster={isMaster}
        replyEligible={replyEligible}
        replyPaused={replyPaused}
        masterReplyEligible={masterReplyEligible}
      />
    </>
  );
}
