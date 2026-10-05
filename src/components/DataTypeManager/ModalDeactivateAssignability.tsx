"use client";

import * as React from "react";
import type { DataTypeFormState } from "./ModalDataType";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import Modal from "@/components/_core/Modal";
import type { DataTypeAdmin } from "@/lib/validations/dataType";

export interface PendingDeactivation {
  dataType: DataTypeAdmin;
  values: DataTypeFormState;
}

interface ModalDeactivateAssignabilityProps {
  pending: PendingDeactivation | null;
  onClose: () => void;
  onConfirm: (values: DataTypeFormState) => Promise<boolean>;
}

// Guardia T-035 (round 2, finding reviewer): un `DataType` con `cardinality`
// già valorizzata (quindi già in uso per assegnazioni ai PG) che perde
// l'assegnabilità verrebbe reso silenziosamente non assegnabile a chiunque,
// nemmeno dal master (`NotAssignableDataTypeError`, non bypassabile — vedi
// `characterData.service.ts`). Questo modal è l'unico punto in cui l'utente
// conferma esplicitamente l'azione distruttiva prima che venga persistita.
const ModalDeactivateAssignability = ({
  pending,
  onClose,
  onConfirm,
}: ModalDeactivateAssignabilityProps) => {
  const [confirming, setConfirming] = React.useState(false);

  const handleConfirm = async () => {
    if (!pending) return;
    setConfirming(true);
    try {
      const ok = await onConfirm(pending.values);
      if (ok) onClose();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal
      open={pending !== null}
      onClose={onClose}
      title="Disattivare l'assegnazione ai giocatori?"
      content={
        <Text
          children={`Disattivare questa opzione renderà "${
            pending?.dataType.name ?? ""
          }" non assegnabile a nessun personaggio, nemmeno dai master.`}
        />
      }
      actionsLoading={confirming}
      actions={
        <>
          <Btn label="ANNULLA" onClick={onClose} />
          <Btn
            variant="bold"
            label="DISATTIVA"
            color="var(--fail)"
            onClick={handleConfirm}
          />
        </>
      }
    />
  );
};

export default ModalDeactivateAssignability;
