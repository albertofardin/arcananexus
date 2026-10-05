import { Fragment } from "react";
import HeroPage from "../HeroPage";
import Badge from "../_core/Badge";
import MarkMissiveRead from "./MarkMissiveRead";
import MissiveMessageEditor from "./MissiveMessageEditor";
import MissiveWriter from "@/components/MissiveWriter";
import { EmptyCard } from "@/components/Feedback";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Divider from "@/components/_core/Divider";
import Avatar from "@/components/_core/Avatar";
import AvatarUser from "@/components/AvatarUser";
import formatDate from "@/lib/utils/formatDate";
import {
  MISSIVE_MASTER_TEXT,
  MISSIVE_MASTER_ICON,
  MISSIVE_MASTER_BG,
  MISSIVE_COMMUN_TEXT,
  MISSIVE_COMMUN_ICON,
  MISSIVE_COMMUN_BG,
} from "@/lib/validations/missive";

export interface MissiveReaderCharacter {
  avatar: string | null;
  name: string;
  user: { name: string };
}

export interface MissiveReaderReceiver {
  name: string;
  avatar: string | null;
  userName: string;
}

export interface MissiveReaderReadByCharacter {
  id: number;
  name: string;
  avatar: string | null;
  userName: string | null;
}

// Un messaggio del thread (T-0xx, "risposte alle missive"): esiste solo nel
// ramo reale (mittente/destinatario sempre `Character` reali), quindi non
// porta i campi Comunicazione/Campo libero della missiva radice — vedi
// `missiveThreadMessageSchema` in `lib/validations/missive.ts`.
export interface MissiveReaderThreadMessage {
  id: number;
  subject: string;
  description: string;
  character: MissiveReaderCharacter | null;
  receiver: MissiveReaderReceiver | null;
  masterSenderName: string | null;
  sendDate: Date;
  markAsRead: boolean;
  // Calcolato server-side (T-0xx, "modifica missiva"): vedi
  // `MissiveMessageEditor`.
  canEdit: boolean;
}

// Eligibilità di risposta calcolata SERVER-SIDE dalla page di dettaglio
// (`getReplyEligibility`, mai dedotta qui): presente solo quando il viewer
// possiede il `Character` che ha davvero diritto al turno. `senderCharacterId`
// decide CON QUALE personaggio del viewer comporre la risposta (un giocatore
// può averne più di uno); `receiverIsPng`/`missivePoints`/`downtimePoints`
// alimentano il banner di esaurimento in `MissiveWriter`, stessa logica già
// usata per una missiva "da zero".
export interface MissiveReaderReplyEligible {
  rootId: number;
  rootSubject: string;
  // Assente quando questa risposta è rivolta al master (T-0xx, missive "a
  // nome del master" rispondibili): non c'è un `Character` destinatario da
  // cui derivare il tipo (PG/PNG), il client non deve inventarsi nulla — il
  // server risolve tutto da `getReplyEligibility` al momento dell'invio
  // (vedi `MissiveWriter.handleSubmit`).
  receiverCharacterId?: number;
  receiverIsPng: boolean;
  senderCharacterId: number;
  missivePoints: number;
  downtimePoints: number;
}

// Eligibilità di risposta DEL MASTER, calcolata SERVER-SIDE dalla page di
// dettaglio (T-0xx, missive "a nome del master" rispondibili): presente
// SOLO quando il viewer è proprio il master che ha diritto al turno (l'unico
// autorizzato a raccogliere la risposta, vedi `getReplyEligibility`) — mai
// un `senderCharacterId` (il master non scrive mai da un `Character`), mai
// punti da consumare (il master non spende MAI, vedi `handlers/missive.ts`).
export interface MissiveReaderMasterReplyEligible {
  rootId: number;
  rootSubject: string;
  // Il PG destinatario di QUESTA risposta, risolto server-side: qui serve
  // solo per un'eventuale etichetta in UI, il valore inviato al server non è
  // mai questo (`MissiveWriter` non lo include nel payload di una risposta
  // "a nome del master", vedi `handleSubmit`).
  receiverCharacterId: number;
}

export interface MissiveReaderProps {
  campaignSlug: string;
  missiveId: number;
  subject: string;
  description: string;
  character: MissiveReaderCharacter | null;
  sendDate: Date;
  isCommunication: boolean;
  readByCharacters?: MissiveReaderReadByCharacter[];
  markAsRead: boolean;
  // Username del master autore "a nome del master" (T-0xx, scenario Marco/
  // Pippo): già `null` server-side per un viewer non-master o per una
  // Comunicazione (vedi `resolveMasterSenderName` in
  // `missive.repository.ts`) — qui il componente lo mostra semplicemente
  // se presente, nessun filtro ulteriore lato client.
  masterSenderName?: string | null;
  // Calcolato server-side (T-0xx, "modifica missiva"): vero SOLO per il
  // mittente reale della RADICE, su un ramo diverso da Comunicazione/"Campo
  // libero"/"a nome del master", finché il destinatario non l'ha ancora
  // letta — vedi `MissiveMessageEditor`. Ogni risposta del thread ha il
  // proprio flag indipendente (`MissiveReaderThreadMessage.canEdit`).
  canEdit?: boolean;
  // Le risposte del thread (radice esclusa, T-0xx): sempre vuoto per una
  // Comunicazione/"Campo libero"/"a nome del master" (il thread esiste solo
  // nel ramo reale, vedi `getThreadReplies`).
  thread?: MissiveReaderThreadMessage[];
  // Tetto configurato di campagna (T-0xx, "canAnswerThread"): presente SOLO
  // quando lo scambio di risposte oltre la singola risposta è abilitato
  // (vedi `missiveFeatureSchema.canAnswerThread` in
  // `lib/features/handlers/missive.ts`) — `null`/assente spegne il badge di
  // conteggio su ogni risposta del thread, nessun'altra logica qui.
  threadMax?: number | null;
  replyEligible?: MissiveReaderReplyEligible | null;
  // `true` quando il PG viewer avrebbe diritto al turno (`replyEligible`
  // sarebbe stato valorizzato) ma lo staff ha sospeso l'invio di missive
  // (T-0xx, `Feature.paused`) — calcolato server-side dalla page di
  // dettaglio, mai qui. Monta un avviso al posto del form di risposta SOLO
  // in questo caso, mai per un viewer che semplicemente non ha il turno
  // (`replyEligible: null` senza questo flag, comportamento invariato:
  // nessun form, nessun avviso).
  replyPaused?: boolean;
  // Presente SOLO quando è il MASTER ad avere diritto al turno (T-0xx,
  // missive "a nome del master" rispondibili): monta un secondo
  // `MissiveWriter` (`characterId: null`, `isMaster: true`) accanto a
  // `replyEligible`, mai in sostituzione — i due sono mutuamente esclusivi
  // per costruzione (`getReplyEligibility` assegna il turno a UN solo
  // partecipante alla volta), ma niente vieta a un master di possedere
  // ANCHE un proprio PG con diritto di risposta nello stesso thread (caso
  // raro, entrambi i form comparirebbero insieme, comportamento accettato).
  masterReplyEligible?: MissiveReaderMasterReplyEligible | null;
  // Flag di campagna (T-0xx): quando attiva, la risposta montata sotto non
  // consuma punti missiva/downtime — mostrata come badge accanto al bottone
  // di invio dentro `MissiveWriter`, non duplicata qui.
  canAnswerFree?: boolean;
  pngCountsAsDowntime?: boolean;
  // Flag di campagna `canAnswer` (T-0xx): inoltrato invariato a ENTRAMBI i
  // `MissiveWriter` di risposta sotto, controlla solo la visibilità del loro
  // checkbox "Permetti al destinatario di rispondere".
  canAnswer?: boolean;
  // Il viewer stesso è master/head_master/super-admin (T-0xx): propagato al
  // form di risposta per lo stesso bypass "nessun limite di punti" già
  // applicato a una missiva "da zero" (vedi `characterId/[actionType]/page.tsx`).
  viewerIsMaster?: boolean;
}

const AvatarMissive = ({
  character,
  isCommunication,
  isFreeReceiver,
  masterFallback,
}: {
  character: { avatar?: string; name: string };
  isCommunication?: boolean;
  isFreeReceiver?: boolean;
  masterFallback?: boolean;
}) => {
  if (isCommunication)
    return (
      <Avatar
        icon={MISSIVE_COMMUN_ICON}
        style={{ backgroundColor: MISSIVE_COMMUN_BG }}
      />
    );
  if (isFreeReceiver) return <Avatar icon="edit_note" />;
  if (character)
    return (
      <AvatarUser src={character.avatar ?? undefined} text={character.name} />
    );
  if (masterFallback)
    return (
      <Avatar
        icon={MISSIVE_MASTER_ICON}
        style={{ backgroundColor: MISSIVE_MASTER_BG }}
      />
    );
  return <Avatar icon="person_off" />;
};

export const MissivePeople = ({
  character,
  receiver,
  isCommunication,
  isFreeReceiver,
  receiverFreeText,
}: {
  character: MissiveReaderCharacter | null;
  receiver: MissiveReaderReceiver | null;
  isCommunication: boolean;
  isFreeReceiver: boolean;
  receiverFreeText: string | null;
}) => {
  return (
    <div className="flex items-center gap-2">
      <AvatarMissive
        character={character}
        isCommunication={isCommunication}
        masterFallback
      />
      <div className="min-w-0 flex-col">
        <Badge disabled icon="edit" label="Mittente" />
        <Text
          size={0}
          weight="bolder"
          ellipsis
          children={
            character
              ? character.name
              : isCommunication
                ? MISSIVE_COMMUN_TEXT
                : MISSIVE_MASTER_TEXT
          }
        />
      </div>
      {isCommunication ? null : (
        <>
          <AvatarMissive
            character={receiver}
            isCommunication={isCommunication}
            isFreeReceiver={isFreeReceiver}
          />
          <div className="min-w-0 flex-col">
            <Badge disabled icon="email_open" label="Destinatario" />
            <Text
              size={0}
              weight="bolder"
              ellipsis
              children={
                isFreeReceiver
                  ? receiverFreeText
                  : (receiver?.name ?? "Personaggio eliminato")
              }
            />
          </div>
        </>
      )}
    </div>
  );
};

const HeaderAnswer = ({
  character,
  sendDate,
  masterSenderName,
}: {
  character: MissiveReaderCharacter | null;
  sendDate: Date;
  masterSenderName?: string | null;
}) => (
  <div className="flex flex-1 items-center gap-2">
    <AvatarMissive character={character} masterFallback />
    <div className="min-w-0 flex-col flex-1 items-center">
      <div className="flex flex-1 items-center">
        <Text
          className="flex-1"
          weight="bolder"
          ellipsis
          children={character ? character.name : MISSIVE_MASTER_TEXT}
        />
        <Text
          size={0}
          className="text-muted-fg"
          children={formatDate(sendDate)}
        />
      </div>
      {character ? (
        <Text
          size={0}
          className="text-muted-fg"
          ellipsis
          children={character.user.name}
        />
      ) : (
        masterSenderName && (
          <Text
            size={0}
            className="text-muted-fg"
            ellipsis
            children={masterSenderName}
          />
        )
      )}
    </div>
  </div>
);

const HeaderMissive = ({
  sendDate,
  character,
  isCommunication,
  masterSenderName,
}: {
  sendDate: Date;
  character: MissiveReaderCharacter | null;
  isCommunication: boolean;
  masterSenderName: string | null;
}) => (
  <div className="flex flex-1 items-center gap-2">
    <AvatarMissive
      character={character}
      isCommunication={isCommunication}
      masterFallback
    />
    <div className="min-w-0 flex-col flex-1 items-center">
      <div className="flex flex-1 items-center">
        <Text
          className="flex-1"
          weight="bolder"
          ellipsis
          children={
            character
              ? character.name
              : isCommunication
                ? MISSIVE_COMMUN_TEXT
                : MISSIVE_MASTER_TEXT
          }
        />
        <Text
          size={0}
          className="text-muted-fg"
          children={formatDate(sendDate)}
        />
      </div>
      {character ? (
        <Text
          size={0}
          className="text-muted-fg"
          ellipsis
          children={character.user.name}
        />
      ) : (
        !isCommunication &&
        masterSenderName && (
          <Text
            size={0}
            className="text-muted-fg"
            ellipsis
            children={masterSenderName}
          />
        )
      )}
    </div>
  </div>
);

const MissiveReader = ({
  campaignSlug,
  missiveId,
  subject,
  description,
  character,
  sendDate,
  isCommunication,
  readByCharacters = [],
  markAsRead,
  masterSenderName = null,
  canEdit = false,
  thread = [],
  threadMax = null,
  replyEligible = null,
  replyPaused = false,
  masterReplyEligible = null,
  canAnswerFree = false,
  pngCountsAsDowntime = false,
  canAnswer = false,
  viewerIsMaster = false,
}: MissiveReaderProps) => {
  return (
    <>
      {markAsRead && (
        <MarkMissiveRead campaignSlug={campaignSlug} missiveId={missiveId} />
      )}

      <HeroPage title={subject} />
      <Card className="flex-col items-stretch gap-2 p-2">
        <HeaderMissive
          sendDate={sendDate}
          character={character}
          isCommunication={isCommunication}
          masterSenderName={masterSenderName}
        />
        <MissiveMessageEditor
          campaignSlug={campaignSlug}
          missiveId={missiveId}
          description={description}
          canEdit={canEdit}
        />

        {isCommunication && readByCharacters.length > 0 && (
          <>
            <Divider />
            <div className="flex flex-col gap-2">
              <Text
                size={0}
                className="text-muted-fg uppercase tracking-wide"
                children="Letta da"
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {readByCharacters.map(reader => (
                  <div key={reader.id} className="flex items-center gap-3">
                    <AvatarUser
                      size={32}
                      src={reader.avatar ?? undefined}
                      text={reader.name}
                    />
                    <div className="min-w-0">
                      <Text weight="bolder" ellipsis children={reader.name} />
                      {reader.userName && (
                        <Text
                          size={0}
                          className="text-muted-fg"
                          ellipsis
                          children={reader.userName}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </Card>

      {thread.map(message => (
        <Fragment key={message.id}>
          {message.markAsRead && (
            <MarkMissiveRead
              campaignSlug={campaignSlug}
              missiveId={message.id}
            />
          )}
          <Card className="flex-col items-stretch gap-2 p-2">
            <HeaderAnswer
              character={message.character}
              sendDate={message.sendDate}
              masterSenderName={message.masterSenderName}
            />
            <MissiveMessageEditor
              campaignSlug={campaignSlug}
              missiveId={message.id}
              description={message.description}
              canEdit={message.canEdit}
            />
          </Card>
        </Fragment>
      ))}

      {replyPaused && (
        <EmptyCard
          icon="pause_circle"
          title="Risposte sospese"
          message="Lo staff ha sospeso l'invio di risposte alle missive da parte dei personaggi. Riprova più tardi."
        />
      )}

      {replyEligible && (
        <MissiveWriter
          characterId={replyEligible.senderCharacterId}
          campaignSlug={campaignSlug}
          missivePoints={replyEligible.missivePoints}
          downtimePoints={replyEligible.downtimePoints}
          pngCountsAsDowntime={pngCountsAsDowntime}
          receivers={[]}
          isMaster={viewerIsMaster}
          canAnswer={canAnswer}
          reply={{
            rootId: replyEligible.rootId,
            rootSubject: replyEligible.rootSubject,
            receiverCharacterId: replyEligible.receiverCharacterId,
            receiverIsPng: replyEligible.receiverIsPng,
            free: canAnswerFree,
            threadPosition: threadMax ? thread.length + 2 : undefined,
            threadMax: threadMax ?? undefined,
          }}
        />
      )}

      {masterReplyEligible && (
        <MissiveWriter
          characterId={null}
          campaignSlug={campaignSlug}
          missivePoints={0}
          downtimePoints={0}
          pngCountsAsDowntime={false}
          receivers={[]}
          isMaster
          canAnswer={canAnswer}
          reply={{
            rootId: masterReplyEligible.rootId,
            rootSubject: masterReplyEligible.rootSubject,
            // Nessun `receiverCharacterId` inviato (T-0xx): il vero
            // destinatario si risolve sempre server-side
            // (`getReplyEligibility` dentro `createMasterMissiveAction`),
            // il client non deve inventarsi nulla.
            receiverIsPng: false,
            free: false,
          }}
        />
      )}
    </>
  );
};

export default MissiveReader;
