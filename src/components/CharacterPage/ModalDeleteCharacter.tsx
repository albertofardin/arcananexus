"use client";

import * as React from "react";
import BadgeRole from "../BadgeRole";
import Modal from "@/components/_core/Modal";
import Btn from "@/components/_core/Btn";
import FieldText from "@/components/_core/FieldText";
import Text from "@/components/_core/Text";
import type { Character } from "@/lib/validations/character";

interface IModalDeleteCharacter {
  character: Pick<Character, "name"> | null;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

// Eliminazione personaggio: irreversibile e a cascata (dati, XP, prenotazioni,
// azioni, missive), quindi richiede di ridigitare il nome esatto del
// personaggio prima di abilitare il pulsante di conferma.
const ModalDeleteCharacter = ({
  character,
  submitting = false,
  onClose,
  onConfirm,
}: IModalDeleteCharacter) => {
  const [confirmText, setConfirmText] = React.useState("");

  // Il modale resta montato tra un'apertura e l'altra: azzera il campo ogni
  // volta che si apre su una campagna (diversa o la stessa), non solo alla
  // chiusura.
  React.useEffect(() => {
    if (character) setConfirmText("");
  }, [character]);

  const handleClose = React.useCallback(() => {
    setConfirmText("");
    onClose();
  }, [onClose]);

  const canConfirm =
    !!character && confirmText === character.name && !submitting;

  return (
    <Modal
      open={!!character}
      onClose={handleClose}
      title="Elimina personaggio"
      titleChildren={<BadgeRole type="onlyMaster" />}
      contentClassName="gap-3"
      content={
        <div className="flex w-[420px] max-w-full flex-col gap-3">
          <Text
            children={
              <>
                Questa azione è irreversibile: elimina definitivamente «
                {character?.name}» insieme a tutti i suoi dati (talenti, XP,
                prenotazioni, azioni, missive).
              </>
            }
          />
          <Text
            size={0}
            className="text-muted-fg"
            children={`Per confermare, scrivi il nome completo del personaggio: "${character?.name ?? ""}"`}
          />
          <FieldText
            placeholder={character?.name}
            value={confirmText}
            onChange={setConfirmText}
          />
        </div>
      }
      actionsLoading={submitting}
      actions={
        <>
          <Btn label="ANNULLA" onClick={handleClose} />
          <Btn
            variant="bold"
            label="ELIMINA"
            color="var(--fail)"
            disabled={!canConfirm}
            onClick={onConfirm}
          />
        </>
      }
    />
  );
};

export default ModalDeleteCharacter;
