"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import Modal from "@/components/_core/Modal";
import FieldText from "@/components/_core/FieldText";
import FieldRichText from "@/components/_core/FieldRichText";
import { useToast } from "@/components/_core/Toast";
import { routes } from "@/app/routes";
import { useIsMobile } from "@/hooks/use-mobile";

export interface ModalNewSupportTicketProps {
  open: boolean;
  onClose: () => void;
}

// Form di apertura di una nuova segnalazione (T-0xx, "Supporto"): a
// differenza degli altri form del progetto (`useApiAction`, che scarta il
// body della risposta) qui serve l'id del ticket appena creato per
// navigare al suo thread, quindi un `fetch` diretto invece dell'hook
// condiviso — stesso identico pattern try/catch/toast, solo con il body
// della risposta letto.
const ModalNewSupportTicket = ({
  open,
  onClose,
}: ModalNewSupportTicketProps) => {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { showToast } = useToast();
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const reset = React.useCallback(() => {
    setSubject("");
    setBody("");
  }, []);

  const handleClose = React.useCallback(() => {
    if (submitting) return;
    reset();
    onClose();
  }, [submitting, reset, onClose]);

  const handleSubmit = React.useCallback(async () => {
    if (!subject.trim() || !body.trim()) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        showToast({
          variant: "error",
          message: json?.error ?? "Errore durante l'invio della segnalazione",
        });
        return;
      }

      const ticket = await response.json();
      showToast({ variant: "success", message: "Segnalazione inviata" });
      reset();
      onClose();
      router.push(routes.profileSupportTicket(ticket.id) as never);
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante l'invio della segnalazione",
      });
    } finally {
      setSubmitting(false);
    }
  }, [subject, body, showToast, reset, onClose, router]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      fullscreen={isMobile}
      title="Segnala un problema"
      content={
        <div className="flex max-w-[500px] flex-col gap-3 sm:min-w-[350px]">
          <Text
            className="text-muted-fg"
            children="Descrivi il problema che hai riscontrato: il team di supporto ti risponderà qui appena possibile."
          />
          <FieldText
            label="Oggetto"
            labelMandatory
            placeholder="Es. Non riesco a caricare l'avatar"
            value={subject}
            onChange={setSubject}
          />
          <FieldRichText
            label="Descrizione"
            labelMandatory
            placeholder="Descrivi il problema nel dettaglio..."
            value={body}
            onChange={setBody}
            uploadEndpoint="supportAttachmentUploader"
          />
        </div>
      }
      actionsLoading={submitting}
      actions={
        <>
          <Btn label="ANNULLA" onClick={handleClose} />
          <Btn
            variant="bold"
            label="INVIA SEGNALAZIONE"
            disabled={!subject.trim() || !body.trim()}
            onClick={handleSubmit}
          />
        </>
      }
    />
  );
};

export default ModalNewSupportTicket;
