"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CharacterType } from "@prisma/client";
import Card from "../_core/Card";
import Text from "../_core/Text";
import Btn from "../_core/Btn";
import Badge from "../_core/Badge";
import BtnCheckbox from "../_core/BtnCheckbox";
import FieldSelect from "../_core/FieldSelect";
import FieldText from "../_core/FieldText";
import FieldRichText from "../_core/FieldRichText";
import { typeIcon, typeColor, typeLabel } from "../BadgeCharacterType";
import type { IPopoverListItem } from "../_core/PopoverList";
import { useApiAction } from "@/hooks/useApiAction";
import { FT_MISSIVE } from "@/lib/features/featuresName";
import { routes } from "@/app/routes";

export interface MissiveReceiver {
  id: number;
  name: string;
  avatar: string | null;
  type: CharacterType;
}

type ReceiverType = CharacterType | "free";

const FREE_RECEIVER_COLOR = "#6B7280";

const RECEIVER_TYPE_ITEMS: IPopoverListItem[] = [
  ...Object.values(CharacterType).map(type => ({
    id: type,
    label: typeLabel(type),
    icon: typeIcon(type),
    iconStyle: { color: typeColor(type) },
  })),
  {
    id: "free",
    label: "Campo libero",
    icon: "edit_note",
    iconStyle: { color: FREE_RECEIVER_COLOR },
  },
];

const receiverTypeIcon = (type: ReceiverType) =>
  type === "free" ? "edit_note" : typeIcon(type);
const receiverTypeColor = (type: ReceiverType) =>
  type === "free" ? FREE_RECEIVER_COLOR : typeColor(type);

// Una RISPOSTA (T-0xx, "risposte alle missive"): mittente/oggetto/
// destinatario sono già fissati dal thread, quindi il form si riduce al solo
// contenuto — vedi il ramo `reply` in `handleSubmit`/`disabled` sotto.
// `receiverIsPng` (risolto server-side dalla page di dettaglio, mai
// dichiarato qui) decide se il banner/costo downtime si applica anche a una
// risposta, stessa regola di `isPngDowntimeMode` per una missiva normale.
export interface MissiveWriterReply {
  rootId: number;
  rootSubject: string;
  receiverCharacterId?: number;
  receiverIsPng: boolean;
  free: boolean;
  threadPosition?: number;
  threadMax?: number;
}

export interface MissiveWriterProps {
  characterId: number | null;
  campaignSlug: string;
  missivePoints: number;
  downtimePoints: number;
  pngCountsAsDowntime: boolean;
  receivers: MissiveReceiver[];
  isMaster?: boolean;
  isCommunication?: boolean;
  excludeCharacterId?: number | null;
  // Flag di campagna `canAnswer` (T-0xx, checkbox "Permetti al destinatario
  // di rispondere"): controlla SOLO la VISIBILITÀ del checkbox, mai la
  // logica di invio — se la campagna non permette comunque risposte, il
  // checkbox non ha senso da mostrare (vedi `missiveFeatureSchema`).
  canAnswer?: boolean;
  // Presente SOLO quando questo form sta componendo una RISPOSTA (montato da
  // `MissiveReader`), mai per una missiva "da zero".
  reply?: MissiveWriterReply;
}

const WARN_INK = "#1a1200";

const MissiveWriter = ({
  characterId,
  campaignSlug,
  missivePoints,
  downtimePoints,
  pngCountsAsDowntime,
  receivers,
  isMaster = false,
  isCommunication = false,
  excludeCharacterId,
  canAnswer = false,
  reply,
}: MissiveWriterProps) => {
  const router = useRouter();
  const { pending, run } = useApiAction();
  const isReply = !!reply;

  const [receiverType, setReceiverType] = React.useState<
    ReceiverType | undefined
  >();
  const [receiverCharacterId, setReceiverCharacterId] = React.useState<
    number | undefined
  >();
  const [freeReceiverText, setFreeReceiverText] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [content, setContent] = React.useState("");
  // Checkbox "Permetti al destinatario di rispondere" (T-0xx, vincolo
  // PER-MESSAGGIO): default attivo, incluso nel payload solo per i rami
  // effettivamente rispondibili (vedi `handleSubmit` sotto) — su
  // Comunicazione/Campo libero resta stato locale morto, mai inviato.
  const [allowReply, setAllowReply] = React.useState(true);

  const filteredReceivers = React.useMemo(
    () =>
      excludeCharacterId != null
        ? receivers.filter(r => r.id !== excludeCharacterId)
        : receivers,
    [receivers, excludeCharacterId]
  );

  const availableReceivers = React.useMemo(
    () =>
      receiverType
        ? filteredReceivers.filter(r => r.type === receiverType)
        : [],
    [receiverType, filteredReceivers]
  );
  const selectedReceiver = availableReceivers.find(
    r => r.id === receiverCharacterId
  );

  // "Campo libero" scala come una missiva a PNG (stesso gate
  // `pngCountsAsDowntime`): non essendoci un `Character.type` reale da cui
  // leggerlo, il costo è deciso qui esattamente come per un vero PNG. Per
  // una risposta non c'è alcun selettore: `reply.receiverIsPng` (risolto
  // server-side) sostituisce `receiverType` come sorgente del gate.
  const isPngDowntimeMode = isReply
    ? reply.receiverIsPng && pngCountsAsDowntime
    : (receiverType === CharacterType.png || receiverType === "free") &&
      pngCountsAsDowntime;
  // Una risposta gratuita (`reply.free`, gate `canAnswerFree` di campagna)
  // salta interamente il controllo di esaurimento, stesso principio del
  // bypass master/head_master/super-admin già esistente per `isMaster`.
  const resourceExhausted =
    !isMaster &&
    !(isReply && reply.free) &&
    (isPngDowntimeMode ? downtimePoints < 1 : missivePoints < 1);

  const handleReceiverTypeChange = (value: ReceiverType | undefined) => {
    setReceiverType(value);
    setReceiverCharacterId(undefined);
    setFreeReceiverText("");
  };

  const handleSubmit = React.useCallback(() => {
    if (!content.trim()) return;
    if (!isReply) {
      if (!subject.trim()) return;
      // Una Comunicazione non ha destinatario: il resto della validazione
      // (tipo/destinatario) si applica solo alla missiva singola.
      if (!isCommunication && !receiverType) return;
      if (
        !isCommunication &&
        receiverType === "free" &&
        !freeReceiverText.trim()
      )
        return;
      if (
        !isCommunication &&
        receiverType !== "free" &&
        (!receiverCharacterId || !selectedReceiver)
      )
        return;
    }

    const endpoint =
      characterId != null
        ? `/api/campaigns/${campaignSlug}/characters/${characterId}/actions`
        : `/api/campaigns/${campaignSlug}/actions`;

    const actionData = isReply
      ? {
          subject: `Re: ${reply.rootSubject}`,
          description: content,
          threadRootId: reply.rootId,
          // Presente solo per una risposta rivolta a un Character reale
          // (ramo esistente): il valore che il client invia viene comunque
          // SEMPRE sovrascritto server-side (`getReplyEligibility`), mai
          // preso per buono da solo — per una risposta rivolta al master
          // (`reply.receiverCharacterId === undefined`) la chiave resta
          // interamente assente, il server calcola tutto da sé.
          ...(reply.receiverCharacterId !== undefined
            ? { receiverCharacterId: reply.receiverCharacterId }
            : {}),
          // Checkbox "Permetti al destinatario di rispondere" (T-0xx): una
          // RISPOSTA è sempre sul ramo reale rispondibile, quindi va sempre
          // inclusa qui.
          allowReply,
        }
      : isCommunication
        ? { subject, description: content, communication: true }
        : receiverType === "free"
          ? {
              subject,
              description: content,
              receiverFreeText: freeReceiverText.trim(),
            }
          : {
              subject,
              description: content,
              // Il tipo (PG/PNG) non va inviato: il server lo risolve dal
              // `Character.type` reale del destinatario, non si fida di un
              // valore dichiarato dal client (vedi `handlers/missive.ts`).
              // `receiverType` qui resta solo per filtrare la select
              // "Destinatario".
              receiverCharacterId: selectedReceiver?.id,
              // Checkbox (T-0xx): incluso solo qui e nel ramo `isReply`
              // sopra — Comunicazione e Campo libero non sono mai
              // rispondibili, il campo lì sarebbe morto (non fa parte dei
              // rispettivi schema Zod, `.strict()` lo rifiuterebbe).
              allowReply,
            };

    return run(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ functionName: FT_MISSIVE, actionData }),
      },
      {
        errorMessage: isReply
          ? "Errore durante l'invio della risposta"
          : isCommunication
            ? "Errore durante l'invio della comunicazione"
            : "Errore durante l'invio della missiva",
        successMessage: isReply
          ? "Risposta inviata"
          : isCommunication
            ? "Comunicazione inviata"
            : "Missiva inviata",
        onSuccess: () => {
          router.push(
            isReply
              ? routes.campaignMissiveDetail(campaignSlug, reply.rootId)
              : routes.campaignMissive(campaignSlug)
          );
          // invalida la router cache (staleTimes): la lista non è stantia
          router.refresh();
        },
      }
    );
  }, [
    allowReply,
    campaignSlug,
    characterId,
    content,
    freeReceiverText,
    isCommunication,
    isReply,
    reply,
    subject,
    receiverCharacterId,
    receiverType,
    run,
    router,
    selectedReceiver,
  ]);

  return (
    <Card className="flex-col items-stretch gap-3 p-3">
      {!isCommunication && !isReply && (
        <>
          <div className="flex items-end">
            <FieldSelect
              className={
                !receiverType
                  ? "flex-1"
                  : "flex-[0.25] border-r-0 rounded-br-none rounded-tr-none"
              }
              label="Destinatario"
              labelMandatory
              placeholder="Seleziona il tipo..."
              icon={receiverType ? receiverTypeIcon(receiverType) : undefined}
              iconStyle={
                receiverType
                  ? { color: receiverTypeColor(receiverType) }
                  : undefined
              }
              value={receiverType}
              items={RECEIVER_TYPE_ITEMS}
              onChange={value =>
                handleReceiverTypeChange(value as ReceiverType | undefined)
              }
            />
            {!receiverType ? null : receiverType === "free" ? (
              <FieldText
                className="flex-1 border-l-0 rounded-bl-none rounded-tl-none"
                placeholder="Scrivi il nome del destinatario..."
                value={freeReceiverText}
                onChange={setFreeReceiverText}
              />
            ) : (
              <FieldSelect
                className="flex-1 border-l-0 rounded-bl-none rounded-tl-none"
                placeholder={
                  !receiverType
                    ? "Seleziona prima il tipo di destinatario..."
                    : availableReceivers.length > 0
                      ? "Seleziona un destinatario..."
                      : "Nessun destinatario disponibile"
                }
                disabled={!receiverType || availableReceivers.length === 0}
                value={receiverCharacterId}
                items={availableReceivers.map(r => ({
                  id: r.id,
                  label: r.name,
                  avatar: r.avatar ?? undefined,
                  avatarText: r.name,
                }))}
                onChange={value =>
                  setReceiverCharacterId(value as number | undefined)
                }
              />
            )}
          </div>

          {!isMaster && isPngDowntimeMode && (
            <div
              className="flex flex-col gap-1 rounded-lg p-3"
              style={{ backgroundColor: "var(--warn)" }}
            >
              <Text
                weight="bolder"
                style={{ color: WARN_INK }}
                children="Questa missiva consumerà 1 punto downtime invece di una missiva."
              />
              <Text
                size={0}
                style={{ color: WARN_INK }}
                children={`Punti downtime disponibili: ${downtimePoints}`}
              />
            </div>
          )}
        </>
      )}

      {isReply && !reply.free && !isMaster && isPngDowntimeMode && (
        <div
          className="flex flex-col gap-1 rounded-lg p-3"
          style={{ backgroundColor: "var(--warn)" }}
        >
          <Text
            weight="bolder"
            style={{ color: WARN_INK }}
            children="Questa risposta consumerà 1 punto downtime invece di una missiva."
          />
          <Text
            size={0}
            style={{ color: WARN_INK }}
            children={`Punti downtime disponibili: ${downtimePoints}`}
          />
        </div>
      )}

      {resourceExhausted ? (
        <Text
          className="text-muted-fg"
          children={
            isPngDowntimeMode
              ? "Punti downtime esauriti: non puoi inviare questa missiva."
              : "Missive esaurite: non puoi inviare altre missive."
          }
        />
      ) : (
        <>
          {!isReply && (
            <FieldText
              label="Oggetto"
              labelMandatory
              value={subject}
              onChange={setSubject}
            />
          )}
          <FieldRichText
            label={reply ? "Risposta" : "Contenuto"}
            labelMandatory
            value={content}
            onChange={setContent}
            campaignSlug={campaignSlug}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {canAnswer &&
            !isCommunication &&
            (isReply || receiverType !== "free") ? (
              <BtnCheckbox
                selected={allowReply}
                label="Permetti al destinatario di rispondere"
                onClick={setAllowReply}
              />
            ) : (
              <div />
            )}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
              {isReply &&
                reply.threadPosition !== undefined &&
                reply.threadMax !== undefined && (
                  <Badge
                    color="var(--info)"
                    icon="chat_done"
                    label={`${reply.threadPosition}/${reply.threadMax}`}
                    tooltip={`Messaggio ${reply.threadPosition} di ${reply.threadMax} nel thread`}
                    className="mr-2"
                  />
                )}
              {isReply &&
                !isMaster &&
                (reply.free ? (
                  <Badge
                    color="var(--succ)"
                    icon="gift_card"
                    label="Risposta gratuita"
                  />
                ) : (
                  <Badge
                    color="var(--info)"
                    icon={isPngDowntimeMode ? "downtime" : "mail"}
                    label={
                      isPngDowntimeMode
                        ? `Downtime disponibili ${downtimePoints}`
                        : `Missive disponibili ${missivePoints}`
                    }
                  />
                ))}
              <Btn
                className="text-center w-[200px]"
                variant="bold"
                color="var(--succ)"
                icon="send"
                label="INVIA"
                labelPosition
                disabled={
                  pending ||
                  !content.trim() ||
                  (!isReply &&
                    ((!isCommunication &&
                      (!receiverType ||
                        (receiverType === "free"
                          ? !freeReceiverText.trim()
                          : !receiverCharacterId))) ||
                      !subject.trim()))
                }
                onClick={handleSubmit}
              />
            </div>
          </div>
        </>
      )}
    </Card>
  );
};

export default MissiveWriter;
