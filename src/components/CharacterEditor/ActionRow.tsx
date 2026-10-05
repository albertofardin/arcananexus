"use client";

import * as React from "react";
import Link from "next/link";
import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";
import Card from "@/components/_core/Card";
import { routes } from "@/app/routes";

const ActionRowEmpty = ({
  icon,
  title,
  counter,
}: {
  icon: string;
  title: string;
  counter: React.ReactNode;
}) => (
  <Card className="flex items-center gap-1 bg-transparent border-transparent min-h-[40px] pr-1">
    <div className="flex h-full min-w-0 flex-1 items-center gap-4 pl-4">
      <Icon className="text-muted-fg" children={icon} />
      <Text weight="bolder" className="flex-1 text-muted-fg" children={title} />
    </div>
    {counter}
  </Card>
);

// Rendering condiviso fra `ActionRow` e `ActionRowMissive` sotto: entrambe
// le azioni mostrano una riga vuota/disabilitata (contatore esaurito o
// scheda non editabile) oppure un link cliccabile verso la feature, e
// differiscono solo nel/nei contatore/i e nella condizione di "esaurito".
const ActionRowDisplay = ({
  icon,
  label,
  functionName,
  characterId,
  campaignSlug,
  canEdit,
  canSend,
  emptyLabel,
  counter,
}: {
  icon: string;
  label: string;
  functionName: string;
  characterId: number;
  campaignSlug: string;
  canEdit: boolean;
  canSend: boolean;
  emptyLabel: string;
  counter: React.ReactNode;
}) => {
  if (!canSend) {
    return <ActionRowEmpty icon={icon} title={emptyLabel} counter={counter} />;
  }

  if (!canEdit) {
    return (
      <ActionRowEmpty
        icon={icon}
        title="Puoi inviare azioni solo quando il personaggio è attivo"
        counter={counter}
      />
    );
  }

  return (
    <Card className="flex items-center gap-1 hover:bg-accent min-h-[40px] pr-1">
      <Link
        href={routes.campaignCharacterAction(
          campaignSlug,
          characterId,
          functionName
        )}
        className="flex h-full min-w-0 flex-1 items-center gap-4 pl-4"
      >
        <Icon className="text-muted-fg" children={icon} />
        <Text weight="bolder" className="flex-1" children={label} />
      </Link>
      {counter}
    </Card>
  );
};

const ActionRow = ({
  active,
  icon,
  label,
  functionName,
  characterId,
  campaignSlug,
  canEdit,
  canSend,
  counter,
  emptyLabel,
}: {
  active: boolean;
  icon: string;
  label: string;
  functionName: string;
  characterId?: number;
  campaignSlug?: string;
  canEdit: boolean;
  canSend: boolean;
  counter: React.ReactNode;
  emptyLabel?: string;
}) => {
  if (!active || !characterId || !campaignSlug) return null;
  return (
    <ActionRowDisplay
      icon={icon}
      label={label}
      functionName={functionName}
      characterId={characterId}
      campaignSlug={campaignSlug}
      canEdit={canEdit}
      canSend={canSend}
      emptyLabel={emptyLabel}
      counter={counter}
    />
  );
};

export default ActionRow;
