"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Btn from "@/components/_core/Btn";
import Modal from "@/components/_core/Modal";
import Text from "@/components/_core/Text";
import { useToast } from "@/components/_core/Toast";
import formatCurrency from "@/lib/utils/formatCurrency";

export interface IBtnEventUnsubscribe {
  eventId: number;
  eventName: string;
  /** Quota rimborsata in buoni (0 se iscritto gratuitamente). */
  refund: number;
}

/** Disiscrizione da un evento, con rimborso della quota pagata come saldo buoni. */
const BtnEventUnsubscribe = ({
  eventId,
  eventName,
  refund,
}: IBtnEventUnsubscribe) => {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const refundLabel = formatCurrency(String(refund));

  const submit = async () => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/events/${eventId}/register`, {
        method: "DELETE",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error);
      showToast({
        variant: "success",
        message:
          refund > 0
            ? `Disiscrizione completata: ${refundLabel} aggiunti al tuo saldo buoni`
            : "Disiscrizione completata",
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      showToast({
        variant: "error",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Errore durante la disiscrizione",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Disiscriviti dall'evento"
        content={
          <div className="flex w-[420px] max-w-full flex-col gap-3">
            <Text
              children={`Stai per annullare la tua iscrizione a "${eventName}". Potrai iscriverti di nuovo finché le iscrizioni restano aperte.`}
            />
            <Text
              weight="bolder"
              children={
                refund > 0
                  ? `Ti verranno rimborsati ${refundLabel} come saldo buoni, non sul metodo di pagamento originale. Il saldo buoni viene scalato automaticamente dalle tue prossime iscrizioni e vale fino alla scadenza della tessera associativa in corso.`
                  : "Non è previsto alcun rimborso: l'iscrizione non era a pagamento."
              }
            />
          </div>
        }
        actionsLoading={submitting}
        actions={
          <>
            <Btn label="ANNULLA" onClick={() => setOpen(false)} />
            <Btn
              variant="bold"
              label="DISISCRIVIMI"
              color="var(--fail)"
              onClick={submit}
            />
          </>
        }
      />
      <Btn
        variant="bold"
        icon="undo"
        label="Disiscriviti"
        color="var(--fail)"
        onClick={() => setOpen(true)}
      />
    </>
  );
};

export default BtnEventUnsubscribe;
