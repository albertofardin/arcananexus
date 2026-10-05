"use client";

import type { CharacterEditorValue } from "./CharacterEditor";
import Accordion from "@/components/_core/Accordion";
import FieldText from "@/components/_core/FieldText";
import Text from "@/components/_core/Text";
import BadgeRole from "@/components/BadgeRole";
import { cn } from "@/lib/utils";

const CharacterEditorNotes = ({
  value,
  canEdit,
  viewingAsMaster,
  onChange,
}: {
  value: Pick<
    CharacterEditorValue,
    "playerNotes" | "masterPublicNotes" | "masterNotes"
  >;
  canEdit: boolean;
  viewingAsMaster: boolean;
  onChange: (patch: Partial<CharacterEditorValue>) => void;
}) => {
  return (
    <Accordion title="Note" titleIcon="edit_note" buttonClassName="px-4 gap-4">
      <div className="flex flex-col gap-1">
        <Text size={0} className="text-muted-fg" children="Note Giocatore" />
        <FieldText
          multiline
          placeholder="Appunti, missioni, legami, oggetti…"
          value={value.playerNotes}
          onChange={playerNotes => onChange({ playerNotes })}
          disabled={!canEdit}
          className={cn(!canEdit && "bg-transparent border-none")}
        />
      </div>
      {(viewingAsMaster || value.masterPublicNotes) && (
        <div className="flex flex-col gap-1">
          <Text
            size={0}
            className="text-muted-fg"
            children="Note Master (visibili al giocatore)"
          />
          <FieldText
            multiline
            placeholder="Comunicazioni, chiarimenti, indicazioni per il giocatore…"
            value={value.masterPublicNotes}
            onChange={masterPublicNotes => onChange({ masterPublicNotes })}
            disabled={!viewingAsMaster}
            className={cn(!viewingAsMaster && "bg-transparent border-none")}
          />
        </div>
      )}
      {viewingAsMaster && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Text
              size={0}
              className="text-muted-fg flex-1"
              children="Note Master (riservate)"
            />
            <BadgeRole type="onlyMaster" />
          </div>
          <FieldText
            multiline
            placeholder="Segreti, trame, ganci narrativi riservati allo staff…"
            value={value.masterNotes}
            onChange={masterNotes => onChange({ masterNotes })}
          />
        </div>
      )}
    </Accordion>
  );
};

export default CharacterEditorNotes;
