"use client";

import type * as React from "react";
import Btn from "@/components/_core/Btn";
import Modal from "@/components/_core/Modal";
import Text from "@/components/_core/Text";

interface IModalConfirmDelete {
  open: boolean;
  title?: string;
  message?: string;
  // Contenuto supplementare (T-027/T-036, gestione avanzata T-030 admin):
  // motivo reale di un 409 "eliminazione bloccata" (dipendenti nel grafo
  // requisiti, assegnazioni a un PG). Assente per gli altri manager.
  extra?: React.ReactNode;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ModalConfirmDelete = ({
  open,
  title = "Elimina voce",
  message = "Sei sicuro di voler eliminare questa voce? L'operazione non è reversibile.",
  extra,
  submitting = false,
  onClose,
  onConfirm,
}: IModalConfirmDelete) => (
  <Modal
    open={open}
    onClose={onClose}
    title={title}
    content={
      <div className="flex flex-col gap-2">
        <Text children={message} />
        {extra}
      </div>
    }
    actionsLoading={submitting}
    actions={
      <>
        <Btn label="ANNULLA" onClick={onClose} />
        <Btn
          variant="bold"
          label="ELIMINA"
          color="var(--fail)"
          onClick={onConfirm}
        />
      </>
    }
  />
);

export default ModalConfirmDelete;
