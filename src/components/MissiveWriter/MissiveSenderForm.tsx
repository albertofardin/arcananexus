"use client";

import * as React from "react";
import { Role } from "@prisma/client";
import Badge from "../_core/Badge";
import MissiveWriter, { type MissiveReceiver } from "./MissiveWriter";
import Card from "@/components/_core/Card";
import FieldSelect from "@/components/_core/FieldSelect";
import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";
import {
  MISSIVE_MASTER_ID,
  MISSIVE_MASTER_TEXT,
  MISSIVE_MASTER_ICON,
  MISSIVE_MASTER_BG,
  MISSIVE_COMMUN_ID,
  MISSIVE_COMMUN_TEXT,
  MISSIVE_COMMUN_ICON,
  MISSIVE_COMMUN_BG,
} from "@/lib/validations/missive";
import { ROLE_COLORS } from "@/lib/constants";
import { IListItem } from "@/components/_core/ListItem";

export interface MissiveSenderCharacter {
  id: number;
  name: string;
  avatar: string | null;
  missivePoints: number;
  downtimePoints: number;
  // Massimale personale (T-0xx, talento "Aggiungi punto Missiva"): sommato
  // a `maxPerEvent` per il badge "X/Y" di QUESTO personaggio, stessa somma
  // di `resetCampaignPointsForActiveCharacters`.
  missivePointsBonus: number;
}

export interface MissiveSenderFormProps {
  campaignSlug: string;
  isMaster: boolean;
  ownCharacters: MissiveSenderCharacter[];
  receivers: MissiveReceiver[];
  maxPerEvent: number;
  pngCountsAsDowntime: boolean;
  // Flag di campagna `canAnswer` (T-0xx): inoltrato invariato al
  // `MissiveWriter` interno, controlla solo la visibilità del checkbox
  // "Permetti al destinatario di rispondere".
  canAnswer: boolean;
}

type SenderValue = number | typeof MISSIVE_MASTER_ID | typeof MISSIVE_COMMUN_ID;

// Selettore "Mittente" (T-0xx) davanti al form di invio missiva riusato
// (`MissiveWriter`): un PG attivo dell'utente (alfabetico), oppure —
// solo per master/head_master/super-admin — "Master" o "Comunicazione", in
// quest'ordine fisso davanti ai PG. Il master vede sempre anche
// `BtnUpdatePointsMissive` accanto al selettore quando sceglie un PG reale,
// stesso componente già usato in scheda personaggio.
const MissiveSenderForm = ({
  campaignSlug,
  isMaster,
  ownCharacters,
  receivers,
  maxPerEvent,
  pngCountsAsDowntime,
  canAnswer,
}: MissiveSenderFormProps) => {
  const sortedOwnCharacters = React.useMemo(
    () => [...ownCharacters].sort((a, b) => a.name.localeCompare(b.name, "it")),
    [ownCharacters]
  );

  const [sender, setSender] = React.useState<SenderValue | undefined>(() => {
    if (isMaster) return MISSIVE_MASTER_ID;
    return ownCharacters.length === 1 ? ownCharacters[0].id : undefined;
  });

  const selectedCharacter =
    typeof sender === "number"
      ? ownCharacters.find(character => character.id === sender)
      : undefined;

  const items: IListItem[] = [
    ...(isMaster
      ? [
          {
            id: MISSIVE_MASTER_ID,
            label: MISSIVE_MASTER_TEXT,
            avatarIcon: MISSIVE_MASTER_ICON,
            avatarShape: "square",
            avatarStyle: { backgroundColor: MISSIVE_MASTER_BG },
          } as IListItem,
          {
            id: MISSIVE_COMMUN_ID,
            label: MISSIVE_COMMUN_TEXT,
            avatarIcon: MISSIVE_COMMUN_ICON,
            avatarShape: "square",
            avatarStyle: { backgroundColor: MISSIVE_COMMUN_BG },
          } as IListItem,
        ]
      : []),
    ...sortedOwnCharacters.map(
      character =>
        ({
          id: character.id,
          label: character.name,
          avatar: character.avatar ?? undefined,
          avatarText: character.name,
          avatarShape: "square",
        }) as IListItem
    ),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex-col items-stretch gap-2 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <FieldSelect
            className="flex-1"
            label="Mittente"
            labelMandatory
            placeholder="Seleziona il mittente"
            items={items}
            value={sender}
            onChange={value => setSender(value as SenderValue)}
          />
          {selectedCharacter && (
            <Badge
              className="mb-1.5"
              color="var(--info)"
              icon="mail"
              label={`${selectedCharacter.missivePoints}/${maxPerEvent + selectedCharacter.missivePointsBonus} missive`}
            />
          )}
        </div>
        {sender === MISSIVE_MASTER_ID && (
          <div
            className="flex items-start gap-3 rounded-lg p-3"
            style={{ backgroundColor: MISSIVE_MASTER_BG }}
          >
            <Icon
              style={{ color: ROLE_COLORS[Role.master] }}
              children={MISSIVE_MASTER_ICON}
            />
            <div className="flex flex-col gap-1">
              <Text weight="bolder" children="Mittente Master" />
              <Text
                size={0}
                children='Il destinatario vedrà come mittente solo "Master". Non saprà quale Master (o PNG) ha scritto la missiva: se la campagna e il mittente lo permettono, potrà comunque rispondere, ma la risposta resterà indirizzata al solo "Master", mai a una persona specifica.'
              />
            </div>
          </div>
        )}
        {sender === MISSIVE_COMMUN_ID && (
          <div
            className="flex items-start gap-3 rounded-lg p-3"
            style={{ backgroundColor: MISSIVE_COMMUN_BG }}
          >
            <Icon
              style={{ color: ROLE_COLORS[Role.head_master] }}
              children={MISSIVE_COMMUN_ICON}
            />
            <div className="flex flex-col gap-1">
              <Text weight="bolder" children="Comunicazione Generale" />
              <Text
                size={0}
                children="Messaggio che verrà inviato a tutti i PG attivi. A seconda dell'esigenza dei master, può essere utilizzato a scopo narrativo come missiva che viene mandata ad ogni personaggio della campagna o semplicemente come comunicazione di servizio. Questo messaggio sarà visualizzato nella lista delle missive e lo staff può visualizzare l'elenco dei PG che l'hanno letto."
              />
            </div>
          </div>
        )}
      </Card>

      {sender !== undefined && (
        // `key` forza il remount quando cambia il mittente: azzera lo stato
        // interno del form (destinatario/contenuto) invece di lasciarlo
        // agganciato al mittente precedente.
        <MissiveWriter
          key={sender}
          campaignSlug={campaignSlug}
          characterId={typeof sender === "number" ? sender : null}
          isMaster={isMaster}
          isCommunication={sender === MISSIVE_COMMUN_ID}
          missivePoints={selectedCharacter?.missivePoints ?? 0}
          downtimePoints={selectedCharacter?.downtimePoints ?? 0}
          pngCountsAsDowntime={pngCountsAsDowntime}
          receivers={receivers}
          excludeCharacterId={typeof sender === "number" ? sender : null}
          canAnswer={canAnswer}
        />
      )}
    </div>
  );
};

export default MissiveSenderForm;
