import Link from "next/link";
import Divider from "../_core/Divider";
import Text from "../_core/Text";
import Avatar from "../_core/Avatar";
import AvatarUser from "../AvatarUser";
import Badge from "../_core/Badge";
import formatDate from "@/lib/utils/formatDate";
import {
  MISSIVE_MASTER_ICON,
  MISSIVE_MASTER_TEXT,
  MISSIVE_COMMUN_TEXT,
  type MissiveBox,
  type MissiveListItem,
  MISSIVE_COMMUN_ICON,
  MISSIVE_COMMUN_BG,
  MISSIVE_MASTER_BG,
} from "@/lib/validations/missive";
import { routes } from "@/app/routes";

export interface MissiveRowProps {
  campaignSlug: string;
  missive: MissiveListItem;
  box: MissiveBox;
}

// Colore dedicato per l'icona "risposta" (T-0xx): stesso ruolo di
// `FREE_RECEIVER_COLOR` in `MissiveWriter.tsx`, non associato a nessun ruolo
// di campagna (a differenza di `MISSIVE_MASTER_BG`/`MISSIVE_COMMUN_BG`, che
// riusano `ROLE_COLORS`) — una risposta non ha un "tipo di mittente"
// concettualmente diverso dal ramo reale, solo un'icona che la distingue a
// colpo d'occhio in lista.
const MISSIVE_REPLY_ICON = "link_back";
const MISSIVE_REPLY_COLOR = "#0f9b8e";
const MISSIVE_REPLY_BG = `color-mix(in srgb, ${MISSIVE_REPLY_COLOR} 20%, transparent)`;

const MissiveRow = ({ campaignSlug, missive, box }: MissiveRowProps) => {
  // URL canonico unico condiviso dall'intero thread (T-0xx): una risposta
  // punta sempre alla pagina della missiva RADICE, mai a una propria pagina
  // di dettaglio — `threadRootId` è garantito non-null quando `isReply` è
  // vero (vedi `missive.repository.ts`).
  const href = routes.campaignMissiveDetail(
    campaignSlug,
    missive.isReply ? (missive.threadRootId as number) : missive.id
  );
  const read = missive.readDate;
  const senderLabel = missive.sender
    ? missive.sender.name
    : box === "all" && !missive.isCommunication && missive.masterSenderName
      ? `${MISSIVE_MASTER_TEXT} (${missive.masterSenderName})`
      : MISSIVE_MASTER_TEXT;

  return (
    <>
      <Link
        href={href as never}
        className="group flex items-center gap-2 p-2 rounded hover:bg-accent"
      >
        {missive.isReply ? (
          <Avatar
            icon={MISSIVE_REPLY_ICON}
            style={{ backgroundColor: MISSIVE_REPLY_BG }}
          />
        ) : missive.sender ? (
          <AvatarUser
            src={missive.sender.avatar ?? undefined}
            text={missive.sender.name}
          />
        ) : missive.isCommunication ? (
          <Avatar
            icon={MISSIVE_COMMUN_ICON}
            style={{ backgroundColor: MISSIVE_COMMUN_BG }}
          />
        ) : (
          <Avatar
            icon={MISSIVE_MASTER_ICON}
            style={{ backgroundColor: MISSIVE_MASTER_BG }}
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-muted-fg">
            {missive.isCommunication ? (
              <Text
                size={0}
                className="text-muted-fg flex-1"
                ellipsis
                children={MISSIVE_COMMUN_TEXT}
              />
            ) : (
              <Text
                size={0}
                className="text-muted-fg flex-1"
                ellipsis
                children={`da ${senderLabel} a ${
                  missive.isFreeReceiver
                    ? missive.receiverFreeText
                    : missive.isMasterReceiver
                      ? MISSIVE_MASTER_TEXT
                      : (missive.receiver?.name ?? "Personaggio eliminato")
                }`}
              />
            )}
            <Badge
              color={read ? "var(--muted-fg)" : "var(--info)"}
              icon={
                missive.isCommunication
                  ? "send"
                  : read
                    ? "mail_outline"
                    : "mail"
              }
              tooltip={
                missive.isCommunication
                  ? undefined
                  : read
                    ? `Letta il ${formatDate(missive.readDate)}`
                    : "Non ancora letta"
              }
              background={!read}
              label={formatDate(missive.sendDate)}
              labelPosition
            />
          </div>
          <div className="flex items-center gap-2">
            {/* Nessun prefisso "RE: " aggiunto qui: `MissiveWriter` lo
                calcola già in compilazione e lo salva dentro `subject`
                (`Re: ${rootSubject}`, vedi `handleSubmit` nel ramo `reply`)
                — anteporlo di nuovo qui produrrebbe un doppio prefisso
                ("RE: Re: ..."). */}
            <Text
              weight="bolder"
              ellipsis
              className="flex-1"
              children={missive.subject}
            />
          </div>
        </div>
      </Link>
      <Divider className="last:hidden mx-2" />
    </>
  );
};

export default MissiveRow;
