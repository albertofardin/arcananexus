"use client";

import * as React from "react";
import Modal from "@/components/_core/Modal";
import Btn from "@/components/_core/Btn";
import FieldText from "@/components/_core/FieldText";
import Text from "@/components/_core/Text";
import type { Campaign } from "@/lib/validations/campaign";

interface IModalDeleteCampaign {
  campaign: Campaign | null;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

// Eliminazione campagna: irreversibile e a cascata su tutto il suo contenuto
// (personaggi, eventi, staff, ecc. — vedi `onDelete: Cascade` in
// schema.prisma), quindi richiede di ridigitare il nome esatto della
// campagna prima di abilitare il pulsante di conferma, non un semplice
// "sei sicuro?".
const ModalDeleteCampaign = ({
  campaign,
  submitting = false,
  onClose,
  onConfirm,
}: IModalDeleteCampaign) => {
  const [confirmText, setConfirmText] = React.useState("");

  // Il modale resta montato tra un'apertura e l'altra: azzera il campo ogni
  // volta che si apre su una campagna (diversa o la stessa), non solo alla
  // chiusura.
  React.useEffect(() => {
    if (campaign) setConfirmText("");
  }, [campaign]);

  const handleClose = React.useCallback(() => {
    setConfirmText("");
    onClose();
  }, [onClose]);

  const canConfirm = !!campaign && confirmText === campaign.name && !submitting;

  return (
    <Modal
      open={!!campaign}
      onClose={handleClose}
      title="Elimina campagna"
      contentClassName="gap-3"
      content={
        <div className="flex w-[420px] max-w-full flex-col gap-3">
          <Text
            children={
              <>
                Questa azione è irreversibile: elimina definitivamente «
                {campaign?.name}» insieme a tutto il suo contenuto (personaggi,
                eventi, staff, dati di campagna).
              </>
            }
          />
          <Text
            size={0}
            className="text-muted-fg"
            children={`Per confermare, scrivi il nome completo della campagna: "${campaign?.name ?? ""}"`}
          />
          <FieldText
            placeholder={campaign?.name}
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
            label="ELIMINA DEFINITIVAMENTE"
            color="var(--fail)"
            disabled={!canConfirm}
            onClick={onConfirm}
          />
        </>
      }
    />
  );
};

export default ModalDeleteCampaign;
