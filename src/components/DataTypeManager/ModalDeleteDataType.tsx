"use client";

import * as React from "react";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import Modal from "@/components/_core/Modal";
import { useToast } from "@/components/_core/Toast";
import type { DataTypeAdmin } from "@/lib/validations/dataType";

interface ModalDeleteDataTypeProps {
  dataType: DataTypeAdmin | null;
  campaignSlug: string;
  onClose: () => void;
  onDeleted: () => Promise<unknown> | void;
}

const ModalDeleteDataType = ({
  dataType,
  campaignSlug,
  onClose,
  onDeleted,
}: ModalDeleteDataTypeProps) => {
  const { showToast } = useToast();
  const [deleting, setDeleting] = React.useState(false);
  // Motivo reale del rifiuto 409 (T-036, guard `CharacterData` assegnate):
  // popolato solo dopo un tentativo di cancellazione fallito, mostrato nel
  // modal di conferma invece di un errore generico (il toast già mostra lo
  // stesso messaggio, questo lo rende persistente finché il modal resta
  // aperto). Resettato ogni volta che cambia il target (nuova apertura).
  const [blockedReason, setBlockedReason] = React.useState<string | null>(null);

  React.useEffect(() => {
    setBlockedReason(null);
  }, [dataType]);

  const handleDelete = async () => {
    if (!dataType) return;
    setDeleting(true);
    setBlockedReason(null);
    try {
      const response = await fetch(
        `/api/campaigns/${campaignSlug}/data-types/${dataType.id}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        if (response.status === 409 && json?.error) {
          setBlockedReason(json.error);
        }
        showToast({
          variant: "error",
          message: json?.error ?? "Errore durante l'eliminazione",
        });
        return;
      }
      showToast({ variant: "success", message: "Tipo di dato eliminato" });
      onClose();
      await onDeleted();
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante l'eliminazione",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      open={dataType !== null}
      onClose={onClose}
      title="Elimina tipo di dato"
      content={
        <>
          <Text
            children={`Sei sicuro di voler eliminare "${dataType?.name ?? ""}"? L'operazione non è reversibile.`}
          />
          {blockedReason ? (
            <Text className="text-fail" children={`Motivo: ${blockedReason}`} />
          ) : (
            !!dataType?._count &&
            dataType._count.referenceData > 0 && (
              <Text
                className="text-fail"
                children={`Verranno eliminate anche a cascata le ${dataType._count.referenceData} voci di catalogo collegate.`}
              />
            )
          )}
        </>
      }
      actionsLoading={deleting}
      actions={
        <>
          <Btn label="ANNULLA" onClick={onClose} />
          <Btn
            variant="bold"
            label="ELIMINA"
            color="var(--fail)"
            onClick={handleDelete}
          />
        </>
      }
    />
  );
};

export default ModalDeleteDataType;
