"use client";

import * as React from "react";
import Badge from "../_core/Badge";
import DowntimeWriter from "./DowntimeWriter";
import Card from "@/components/_core/Card";
import FieldSelect from "@/components/_core/FieldSelect";
import { IListItem } from "@/components/_core/ListItem";

export interface DowntimeSenderCharacter {
  id: number;
  name: string;
  avatar: string | null;
  downtimePoints: number;
}

export interface DowntimeSenderFormProps {
  campaignSlug: string;
  ownCharacters: DowntimeSenderCharacter[];
  categories: string[];
}

// Selettore "Personaggio" (T-0xx) davanti al form di dichiarazione downtime
// riusato (`DowntimeWriter`): a differenza di `MissiveSenderForm` non
// c'è alcun mittente "a nome del master"/"Comunicazione" — una downtime ha
// SEMPRE un personaggio reale come autore, quindi la select elenca solo i
// PG attivi dell'utente (alfabetico), pre-selezionato in automatico quando
// ce n'è uno solo.
const DowntimeSenderForm = ({
  campaignSlug,
  ownCharacters,
  categories,
}: DowntimeSenderFormProps) => {
  const sortedOwnCharacters = React.useMemo(
    () => [...ownCharacters].sort((a, b) => a.name.localeCompare(b.name, "it")),
    [ownCharacters]
  );

  const [characterId, setCharacterId] = React.useState<number | undefined>(
    () => (ownCharacters.length === 1 ? ownCharacters[0].id : undefined)
  );

  const selectedCharacter = ownCharacters.find(
    character => character.id === characterId
  );

  const items: IListItem[] = sortedOwnCharacters.map(
    character =>
      ({
        id: character.id,
        label: character.name,
        avatar: character.avatar ?? undefined,
        avatarText: character.name,
        avatarShape: "square",
      }) as IListItem
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex-col items-stretch gap-2 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <FieldSelect
            className="flex-1"
            label="Personaggio"
            labelMandatory
            placeholder="Seleziona il personaggio"
            items={items}
            value={characterId}
            onChange={value => setCharacterId(value as number | undefined)}
          />
          {selectedCharacter && (
            <Badge
              className="mb-1.5"
              color="var(--info)"
              icon="downtime"
              label={`${selectedCharacter.downtimePoints} punti downtime`}
            />
          )}
        </div>
      </Card>

      {characterId !== undefined && (
        // `key` forza il remount quando cambia il personaggio: azzera lo
        // stato interno del form (categoria/descrizione) invece di
        // lasciarlo agganciato al personaggio precedente.
        <DowntimeWriter
          key={characterId}
          campaignSlug={campaignSlug}
          characterId={characterId}
          downtimePoints={selectedCharacter?.downtimePoints ?? 0}
          categories={categories}
        />
      )}
    </div>
  );
};

export default DowntimeSenderForm;
