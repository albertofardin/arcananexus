"use client";

import * as React from "react";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import FieldText from "@/components/_core/FieldText";
import Modal from "@/components/_core/Modal";
import { useApiAction } from "@/hooks/useApiAction";
import BadgeRole from "@/components/BadgeRole";

interface ModalUpdateXpProps {
  open: boolean;
  onClose: () => void;
  characterId: number;
  onUpdated: () => void;
}

const ModalUpdateXp = ({
  open,
  onClose,
  characterId,
  onUpdated,
}: ModalUpdateXpProps) => {
  const { pending: submitting, run } = useApiAction();
  const [amount, setAmount] = React.useState("0");

  React.useEffect(() => {
    if (open) setAmount("0");
  }, [open]);

  const parsedAmount = Number(amount.trim());
  const isValid = Number.isInteger(parsedAmount) && parsedAmount !== 0;

  const handleSubmit = React.useCallback(() => {
    if (!isValid) return;

    return run(
      `/api/characters/${characterId}/xp-update`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsedAmount }),
      },
      {
        errorMessage: "Errore durante l'aggiornamento degli XP",
        successMessage: "XP aggiornati",
        onSuccess: () => {
          onUpdated();
          onClose();
        },
      }
    );
  }, [characterId, isValid, onClose, onUpdated, parsedAmount, run]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Aggiorna XP"
      titleChildren={<BadgeRole type="onlyMaster" />}
      content={
        <div className="flex flex-col gap-3 sm:min-w-[320px]">
          <Text className="text-muted-fg">
            XP da inviare al saldo di questo personaggio.
            <br />
            Puoi inserire un valore positivo per aggiungerli o negativo per
            sottrarli.
          </Text>
          <FieldText
            inputType="number"
            error={amount.trim() !== "" && !isValid}
            value={amount}
            onChange={setAmount}
          />
        </div>
      }
      actionsLoading={submitting}
      actions={
        <>
          <Btn label="ANNULLA" onClick={onClose} />
          <Btn
            color="var(--succ)"
            variant="bold"
            label="APPLICA"
            disabled={!isValid}
            onClick={handleSubmit}
          />
        </>
      }
    />
  );
};

export default ModalUpdateXp;
